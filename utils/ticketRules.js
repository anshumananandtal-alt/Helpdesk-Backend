export const STATUS_TRANSITIONS = {
    open: ['in_progress'],
    in_progress: ['waiting_on_customer', 'resolved'],
    waiting_on_customer: ['in_progress', 'resolved'],
    resolved: ['closed', 'reopened'],
    reopened: ['in_progress'],
    closed: [],
};

const isStaff = (role) => role === 'agent' || role === 'admin';

export const getAllowedNextStatuses = (ticket, user) => {
    const transitions = STATUS_TRANSITIONS[ticket.status] ?? [];
    if (user.role === 'admin') {
        return [...transitions];
    }
    if (user.role === 'customer') {
        const creatorId = ticket.creator?._id?.toString() ?? ticket.creator?.toString();
        if (creatorId !== user.id) {
            return [];
        }
        if (ticket.status === 'resolved') {
            return transitions.filter((status) => status === 'closed' || status === 'reopened');
        }
        return ticket.status === 'waiting_on_customer'
            ? transitions.filter((status) => status === 'in_progress')
            : [];
    }
    if (isStaff(user.role)) {
        return transitions.filter((status) =>
            status !== 'closed' && status !== 'reopened'
        );
    }
    return [];
};
