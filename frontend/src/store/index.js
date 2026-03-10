import { configureStore } from '@reduxjs/toolkit'
import agentReducer from './slices/agentSlice'
import userReducer from './slices/userSlice'
import authReducer from './slices/authSlice'

export default configureStore({
  reducer: {
    agent: agentReducer,
    user: userReducer,
    auth: authReducer,
  },
})
