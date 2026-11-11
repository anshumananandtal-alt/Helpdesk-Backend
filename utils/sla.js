const inactiveStatuses = ['resolved', 'closed', 'waiting_on_customer'];
const SLA_HOURS = { urgent: 4, high: 8, medium: 24, low: 72 };

export const calculateSlaDeadline = (priority, createdAt = new Date()) => {
    const hours = SLA_HOURS[priority] ?? SLA_HOURS.low;
    return new Date(new Date(createdAt).getTime() + hours * 60 * 60 * 1000);
};

export const getTicketSlaDeadline = (ticket) => {
    const deadline = ticket.slaDeadline ?? ticket.slaDueAt;
    if (deadline) {
        return new Date(deadline);
    }
    return ticket.createdAt
        ? calculateSlaDeadline(ticket.priority, ticket.createdAt)
        : undefined;
};

export const isTicketBreached = (ticket, now = new Date()) => {
    if (inactiveStatuses.includes(ticket.status)) {
        return false;
    }
    const deadline = getTicketSlaDeadline(ticket);
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
