import { createAsyncThunk, createSlice } from '@reduxjs/toolkit'
import * as authApi from './authApi'
import type { AuthUser, LoginCredentials } from './authApi'

interface AuthState {
  user: AuthUser | null
  status: 'idle' | 'loading' | 'failed'
  error: string | null
}

const initialState: AuthState = {
  user: null,
  status: 'idle',
  error: null,
}

export const loginUser = createAsyncThunk('auth/login', (credentials: LoginCredentials) =>
  authApi.login(credentials),
)

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    loggedOut(state) {
      state.user = null
      state.status = 'idle'
      state.error = null
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(loginUser.pending, (state) => {
        state.status = 'loading'
        state.error = null
      })
      .addCase(loginUser.fulfilled, (state, action) => {
        state.status = 'idle'
        state.user = action.payload
      })
      .addCase(loginUser.rejected, (state, action) => {
        state.status = 'failed'
        state.error = action.error.message ?? 'Login failed'
      })
  },
})

export const { loggedOut } = authSlice.actions
export default authSlice.reducer
