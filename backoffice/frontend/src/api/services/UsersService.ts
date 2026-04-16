/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { User } from '../models/User';
import type { UserInput } from '../models/UserInput';
import type { UsersList } from '../models/UsersList';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class UsersService {
    /**
     * Get all users
     * @param page
     * @param size
     * @returns UsersList List of users
     * @throws ApiError
     */
    public static getUsers(
        page?: number,
        size: number = 10,
    ): CancelablePromise<UsersList> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/users',
            query: {
                'page': page,
                'size': size,
            },
        });
    }
    /**
     * Create a new user
     * @param requestBody
     * @returns User User created
     * @throws ApiError
     */
    public static createUser(
        requestBody: UserInput,
    ): CancelablePromise<User> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/users',
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * Get user by ID
     * @param id
     * @returns User User found
     * @throws ApiError
     */
    public static getUser(
        id: number,
    ): CancelablePromise<User> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/users/{id}',
            path: {
                'id': id,
            },
        });
    }
    /**
     * Update user
     * @param id
     * @param requestBody
     * @returns User User updated
     * @throws ApiError
     */
    public static updateUser(
        id: number,
        requestBody: UserInput,
    ): CancelablePromise<User> {
        return __request(OpenAPI, {
            method: 'PUT',
            url: '/users/{id}',
            path: {
                'id': id,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * Delete user
     * @param id
     * @returns void
     * @throws ApiError
     */
    public static deleteUser(
        id: number,
    ): CancelablePromise<void> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/users/{id}',
            path: {
                'id': id,
            },
        });
    }
}
