/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { Order } from '../models/Order';
import type { OrderInput } from '../models/OrderInput';
import type { OrdersList } from '../models/OrdersList';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class OrdersService {
    /**
     * Get all orders
     * @param page
     * @param size
     * @returns OrdersList List of orders
     * @throws ApiError
     */
    public static getOrders(
        page?: number,
        size: number = 10,
    ): CancelablePromise<OrdersList> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/orders',
            query: {
                'page': page,
                'size': size,
            },
        });
    }
    /**
     * Create a new order
     * @param requestBody
     * @returns Order Order created
     * @throws ApiError
     */
    public static createOrder(
        requestBody: OrderInput,
    ): CancelablePromise<Order> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/orders',
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * Get order by ID
     * @param id
     * @returns Order Order found
     * @throws ApiError
     */
    public static getOrder(
        id: number,
    ): CancelablePromise<Order> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/orders/{id}',
            path: {
                'id': id,
            },
        });
    }
    /**
     * Update order
     * @param id
     * @param requestBody
     * @returns Order Order updated
     * @throws ApiError
     */
    public static updateOrder(
        id: number,
        requestBody: OrderInput,
    ): CancelablePromise<Order> {
        return __request(OpenAPI, {
            method: 'PUT',
            url: '/orders/{id}',
            path: {
                'id': id,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * Delete order
     * @param id
     * @returns void
     * @throws ApiError
     */
    public static deleteOrder(
        id: number,
    ): CancelablePromise<void> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/orders/{id}',
            path: {
                'id': id,
            },
        });
    }
}
