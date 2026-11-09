import Ticket from '../models/Ticket.js';

export const getDashboard = async (req, res) => {
    try {
        const [dashboard = {
            ticketCountPerStatus: [],
            averageResolutionHours: 0,
            breachedTicketsPerPriority: []
        }] = await Ticket.aggregate([
            {
                $facet: {
                    ticketCountPerStatus: [
                        {
                            $group: {
                                _id: '$status',
                                count: { $sum: 1 }
                            }
                        },
                        { $sort: { _id: 1 } },
                        {
                            $project: {
                                _id: 0,
                                status: '$_id',
                                count: 1
                            }
                        }
                    ],
                    averageResolutionTime: [
                        {
                            $match: {
                                resolvedAt: { $ne: null }
                            }
                        },
                        {
                            $group: {
                                _id: null,
                                averageHours: {
                                    $avg: {
                                        $divide: [
                                            { $subtract: ['$resolvedAt', '$createdAt'] },
                                            1000 * 60 * 60
                                        ]
                                    }
                                }
                            }
                        },
                        {
                            $project: {
                                _id: 0,
                                averageHours: {
                                    $round: ['$averageHours', 2]
                                }
                            }
                        }
                    ],
                    breachedTicketsPerPriority: [
                        {
                            $match: {
                                $or: [
                                    { breached: true },
                                    {
                                        slaDueAt: { $lt: new Date() },
                                        status: { $nin: ['resolved', 'closed'] }
                                    }
                                ]
                            }
                        },
                        {
                            $group: {
                                _id: '$priority',
                                count: { $sum: 1 }
                            }
                        },
                        { $sort: { _id: 1 } },
                        {
                            $project: {
                                _id: 0,
                                priority: '$_id',
                                count: 1
                            }
                        }
                    ]
                }
            },
            {
                $project: {
                    ticketCountPerStatus: 1,
                    averageResolutionHours: {
                        $ifNull: [
                            { $arrayElemAt: ['$averageResolutionTime.averageHours', 0] },
                            0
                        ]
                    },
                    breachedTicketsPerPriority: 1
                }
            }
        ]);

        res.json(dashboard);
    } catch (error) {
        console.error('Error generating admin dashboard:', error);
        res.status(500).json({ message: 'Error generating admin dashboard' });
    }
};