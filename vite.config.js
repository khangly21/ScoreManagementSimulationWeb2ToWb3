import { defineConfig } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'

// https://vite.dev/config/
export default defineConfig({
  base: '/ScoreManagementSimulationWeb2ToWb3/', // tên repo của bạn
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] })
  ],
})
