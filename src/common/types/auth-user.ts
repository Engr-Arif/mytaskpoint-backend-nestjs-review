export interface AuthUser {
  id: string;
  role?: import('../enums/role.enum').Role;
  email?: string | null;
}
