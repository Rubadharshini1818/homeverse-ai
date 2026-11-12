import mongoose from 'mongoose'
import app from './app.js'
import { config } from './config.js'

mongoose.connection.on('error', (error) => {
  console.error('MongoDB connection error:', error.message)
})
mongoose.connection.on('disconnected', () => {
  console.error('MongoDB connection was lost.')
})

try {
  await mongoose.connect(config.mongoUri, {
    serverSelectionTimeoutMS: 10_000,
    autoIndex: true
  })
  const server = app.listen(config.port, () => {
    console.log(`HomeverseAI API listening on port ${config.port}`)
  })
  const shutdown = async (signal) => {
    console.log(`${signal} received; closing HomeverseAI API.`)
    server.close(async () => {
      await mongoose.disconnect()
      process.exit(0)
    })
  }
  process.once('SIGINT', () => shutdown('SIGINT'))
  process.once('SIGTERM', () => shutdown('SIGTERM'))
} catch (error) {
  console.error('HomeverseAI API could not connect to MongoDB:', error.message)
  process.exitCode = 1
}
