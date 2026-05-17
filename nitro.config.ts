import { defineNitroConfig } from 'nitropack/config'

export default defineNitroConfig({
  // Use cloudflare-pages preset for Cloudflare Pages SSR
  preset: 'cloudflare-pages',
  
  // Cloudflare Pages specific settings
  cloudflare: {
    pages: {
      // Enable Pages Functions
      defaultFunction: true
    }
  }
})
