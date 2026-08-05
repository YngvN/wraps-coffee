import { apiClient } from '../../lib/axiosClient'

export interface LoginCredentials {
  email: string
  password: string
}

export interface AuthUser {
  id: string
  email: string
  name: string
}

export async function login(credentials: LoginCredentials): Promise<AuthUser> {
  const { data } = await apiClient.post<AuthUser>('/auth/login', credentials)
  return data
}

export async function logout(): Promise<void> {
  await apiClient.post('/auth/logout')
}
