import type { Container } from "inversify";
import { Router } from "express";

import { ScimController } from "./scim.controller.js";
import { createScimAuthMiddleware } from "./scim-auth.middleware.js";

/**
 * SCIM 2.0 routes — mount at `/scim/v2` (bearer auth, outside CSRF).
 */
export function createScimRouter(container: Container): Router {
  const controller = container.get(ScimController);
  const auth = createScimAuthMiddleware(container);
  const router = Router();

  router.get("/ServiceProviderConfig", auth, (req, res) =>
    controller.serviceProviderConfig(req, res),
  );

  router.get("/Users", auth, (req, res) => controller.listUsers(req, res));
  router.post("/Users", auth, (req, res) => controller.createUser(req, res));
  router.get("/Users/:id", auth, (req, res) => controller.getUser(req, res));
  router.patch("/Users/:id", auth, (req, res) => controller.updateUser(req, res));
  router.put("/Users/:id", auth, (req, res) => controller.updateUser(req, res));
  router.delete("/Users/:id", auth, (req, res) => controller.deactivateUser(req, res));

  router.get("/Groups", auth, (req, res) => controller.listGroups(req, res));
  router.post("/Groups", auth, (req, res) => controller.createGroup(req, res));
  router.get("/Groups/:id", auth, (req, res) => controller.getGroup(req, res));
  router.patch("/Groups/:id", auth, (req, res) => controller.updateGroup(req, res));
  router.put("/Groups/:id", auth, (req, res) => controller.updateGroup(req, res));
  router.delete("/Groups/:id", auth, (req, res) => controller.deleteGroup(req, res));

  return router;
}
