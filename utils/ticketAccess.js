const idString = (value) => {
    if (value && typeof value === 'object' && '_id' in value) {
        return value._id?.toString();
    }
    return value?.toString();
};

export const canAccessTicket = (ticket, user) => {
    if (user.role === 'admin' || user.role === 'agent') {
        return true;
    }
    if (user.role === 'customer') {
        return idString(ticket.creator) === user.id;
    }
    return false;
};
