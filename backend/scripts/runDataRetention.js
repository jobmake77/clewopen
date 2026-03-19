import { runDataRetentionSweep } from '../services/dataRetentionService.js'

runDataRetentionSweep()
  .then((result) => {
    console.log('Data retention sweep result:', result)
    process.exit(0)
  })
  .catch((error) => {
    console.error('Data retention sweep failed:', error)
    process.exit(1)
  })
