import { onRequest as __api_auth_login_js_onRequest } from "D:\\Kasra\\functions\\api\\auth\\login.js"
import { onRequest as __api_missions_js_onRequest } from "D:\\Kasra\\functions\\api\\missions.js"
import { onRequest as __api_projects_js_onRequest } from "D:\\Kasra\\functions\\api\\projects.js"
import { onRequest as __api_users_js_onRequest } from "D:\\Kasra\\functions\\api\\users.js"

export const routes = [
    {
      routePath: "/api/auth/login",
      mountPath: "/api/auth",
      method: "",
      middlewares: [],
      modules: [__api_auth_login_js_onRequest],
    },
  {
      routePath: "/api/missions",
      mountPath: "/api",
      method: "",
      middlewares: [],
      modules: [__api_missions_js_onRequest],
    },
  {
      routePath: "/api/projects",
      mountPath: "/api",
      method: "",
      middlewares: [],
      modules: [__api_projects_js_onRequest],
    },
  {
      routePath: "/api/users",
      mountPath: "/api",
      method: "",
      middlewares: [],
      modules: [__api_users_js_onRequest],
    },
  ]