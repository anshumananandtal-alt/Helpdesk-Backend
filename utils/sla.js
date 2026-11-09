const inactiveStatuses = ['resolved', 'closed', 'waiting_on_customer'];

export const isTicketBreached = (ticket, now = new Date()) => {
    if (inactiveStatuses.includes(ticket.status)) {
        return false;
    }
    const deadline = ticket.slaDeadline ?? ticket.slaDueAt;
    return ticket.breached === true || Boolean(deadline && new Date(deadline) < now);
};

export const getBreachedFilter = (breached, now = new Date()) => {
    if (breached) {
        return {
            $and: [
                { status: { $nin: inactiveStatuses } },
                {
                    $or: [
                        { breached: true },
                        { slaDeadline: { $lt: now } },
                        { slaDueAt: { $lt: now } },
                    ],
                },
            ],
        };
    }

    return {
        $or: [
            { status: { $in: inactiveStatuses } },
            {
                $and: [
                    { status: { $nin: inactiveStatuses } },
                    { breached: { $ne: true } },
                    {
                        $or: [
                            { slaDeadline: { $gte: now } },
                            { slaDeadline: { $exists: false }, slaDueAt: { $gte: now } },
                            {
                                slaDeadline: { $exists: false },
                                slaDueAt: { $exists: false },
                            },
                        ],
                    },
                ],
            },
        ],
    };
};
