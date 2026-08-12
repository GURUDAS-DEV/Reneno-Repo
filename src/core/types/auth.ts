export type UserRole = 'SELLER' | 'CUSTOMER';

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
}
