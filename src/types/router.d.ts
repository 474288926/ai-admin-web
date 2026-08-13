import 'vue-router'

export {}

declare module 'vue-router' {
  interface RouteMeta {
    public?: boolean
    title?: string
    description?: string
  }
}
