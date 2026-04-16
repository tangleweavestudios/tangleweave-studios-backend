/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type UserInput = {
    name: string;
    email: string;
    role: UserInput.role;
    active?: boolean;
};
export namespace UserInput {
    export enum role {
        ADMIN = 'admin',
        USER = 'user',
        MANAGER = 'manager',
    }
}

