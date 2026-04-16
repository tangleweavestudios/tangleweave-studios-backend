/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { Product } from '../models/Product';
import type { ProductInput } from '../models/ProductInput';
import type { ProductsList } from '../models/ProductsList';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class ProductsService {
    /**
     * Get all products
     * @param page
     * @param size
     * @returns ProductsList List of products
     * @throws ApiError
     */
    public static getProducts(
        page?: number,
        size: number = 10,
    ): CancelablePromise<ProductsList> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/products',
            query: {
                'page': page,
                'size': size,
            },
        });
    }
    /**
     * Create a new product
     * @param requestBody
     * @returns Product Product created
     * @throws ApiError
     */
    public static createProduct(
        requestBody: ProductInput,
    ): CancelablePromise<Product> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/products',
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * Get product by ID
     * @param id
     * @returns Product Product found
     * @throws ApiError
     */
    public static getProduct(
        id: number,
    ): CancelablePromise<Product> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/products/{id}',
            path: {
                'id': id,
            },
        });
    }
    /**
     * Update product
     * @param id
     * @param requestBody
     * @returns Product Product updated
     * @throws ApiError
     */
    public static updateProduct(
        id: number,
        requestBody: ProductInput,
    ): CancelablePromise<Product> {
        return __request(OpenAPI, {
            method: 'PUT',
            url: '/products/{id}',
            path: {
                'id': id,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * Delete product
     * @param id
     * @returns void
     * @throws ApiError
     */
    public static deleteProduct(
        id: number,
    ): CancelablePromise<void> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/products/{id}',
            path: {
                'id': id,
            },
        });
    }
}
