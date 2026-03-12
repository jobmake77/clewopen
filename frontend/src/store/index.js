import { configureStore } from '@reduxjs/toolkit'
import agentReducer from './slices/agentSlice'
import authReducer from './slices/authSlice'
import skillReducer from './slices/skillSlice'
import mcpReducer from './slices/mcpSlice'

export default configureStore({
  reducer: {
    agent: agentReducer,
    auth: authReducer,
    skill: skillReducer,
    mcp: mcpReducer,
  },
})
