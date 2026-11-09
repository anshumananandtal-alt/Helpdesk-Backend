import Ticket from '../models/ticket.js';

export const getDashboard = async (req, res) => {
    try {
        const now = new Date();
        const [dashboard = {
            ticketCountPerStatus: [],
            averageResolutionHours: 0,
            breachedTicketsPerPriority: [],
        }] = await Ticket.aggregate([
            {
                $facet: {
                    ticketCountPerStatus: [
                        { $group: { _id: '$status', count: { $sum: 1 } } },
                        { $sort: { _id: 1 } },
                        { $project: { _id: 0, status: '$_id', count: 1 } },
                    ],
                    averageResolutionTime: [
                        { $match: { resolvedAt: { $type: 'date' } } },
                        {
                            $group: {
                                _id: null,
                                averageHours: {
                                    $avg: {
                                        $divide: [
                                            { $subtract: ['$resolvedAt', '$createdAt'] },
                                            60 * 60 * 1000,
                                        ],
                                    },
                                },
                            },
                        },
                        { $project: { _id: 0, averageHours: { $round: ['$averageHours', 2] } } },
                    ],
                    breachedTicketsPerPriority: [
                        {
                            $match: {
                                status: { $nin: ['resolved', 'closed', 'waiting_on_customer'] },
                                $or: [
                                    { breached: true },
                                    { slaDeadline: { $lt: now } },
                                    { slaDueAt: { $lt: now } },
                                ],
                            },
                        },
                        { $group: { _id: '$priority', count: { $sum: 1 } } },
                        { $sort: { _id: 1 } },
                        { $project: { _id: 0, priority: '$_id', count: 1 } },
                    ],
                },
            },
            {
                $project: {
                    ticketCountPerStatus: 1,
                    averageResolutionHours: {
                        $ifNull: [{ $arrayElemAt: ['$averageResolutionTime.averageHours', 0] }, 0],
                    },
                    breachedTicketsPerPriority: 1,
                },
            },
        ]);
        res.json(dashboard);
    } catch (error) {
        console.error('Error generating admin dashboard:', error);
        res.status(500).json({ message: 'Error generating admin dashboard' });
    }
};
