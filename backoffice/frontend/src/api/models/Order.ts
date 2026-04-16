/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type Order = {
    id?: number;
    userId?: number;
    userName?: string;
    productId?: number;
    productName?: string;
    quantity?: number;
    status?: Order.status;
    totalPrice?: number;
    createdAt?: string;
};
export namespace Order {
    export enum status {
        PENDING = 'pending',
        PROCESSING = 'processing',
        SHIPPED = 'shipped',
        DELIVERED = 'delivered',
        CANCELLED = 'cancelled',
    }
}

