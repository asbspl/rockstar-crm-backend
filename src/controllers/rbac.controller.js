const ApiResponse = require("../utils/ApiResponse");
const createRbacService = require("../services/rbac.service");

function createRbacController() {
  const service = createRbacService();

  function actor(req) {
    return {
      userId: req.auth.userId,
      roles: req.auth.roles || [],
      permissions: req.auth.permissions || [],
    };
  }

  return {
    async listRoles(req, res, next) {
      try {
        res.status(200).json(new ApiResponse("Roles retrieved successfully", await service.listRoles()));
      } catch (error) {
        next(error);
      }
    },

    async createRole(req, res, next) {
      try {
        res.status(201).json(new ApiResponse("Role created successfully", await service.createRole(req.body)));
      } catch (error) {
        next(error);
      }
    },

    async updateRole(req, res, next) {
      try {
        res.status(200).json(new ApiResponse(
          "Role updated successfully",
          await service.updateRole(req.params.id, req.body, actor(req).roles),
        ));
      } catch (error) {
        next(error);
      }
    },

    async deleteRole(req, res, next) {
      try {
        res.status(200).json(new ApiResponse(
          "Role deleted successfully",
          await service.deleteRole(req.params.id, actor(req).roles),
        ));
      } catch (error) {
        next(error);
      }
    },

    async listPermissions(req, res, next) {
      try {
        res.status(200).json(new ApiResponse(
          "Permissions retrieved successfully",
          await service.listPermissions(),
        ));
      } catch (error) {
        next(error);
      }
    },

    async createPermission(req, res, next) {
      try {
        res.status(201).json(new ApiResponse(
          "Permission created successfully",
          await service.createPermission(req.body),
        ));
      } catch (error) {
        next(error);
      }
    },

    async updatePermission(req, res, next) {
      try {
        res.status(200).json(new ApiResponse(
          "Permission updated successfully",
          await service.updatePermission(req.params.id, req.body, actor(req).roles),
        ));
      } catch (error) {
        next(error);
      }
    },

    async listModules(req, res, next) {
      try {
        res.status(200).json(new ApiResponse(
          "Permission modules retrieved successfully",
          await service.listModules(),
        ));
      } catch (error) {
        next(error);
      }
    },

    async createModule(req, res, next) {
      try {
        res.status(201).json(new ApiResponse(
          "Permission module created successfully",
          await service.createModule(req.body),
        ));
      } catch (error) {
        next(error);
      }
    },

    async updateModule(req, res, next) {
      try {
        res.status(200).json(new ApiResponse(
          "Permission module updated successfully",
          await service.updateModule(req.params.id, req.body),
        ));
      } catch (error) {
        next(error);
      }
    },

    async deleteModule(req, res, next) {
      try {
        res.status(200).json(new ApiResponse(
          "Permission module deleted successfully",
          await service.deleteModule(req.params.id),
        ));
      } catch (error) {
        next(error);
      }
    },

    async getRolePermissions(req, res, next) {
      try {
        res.status(200).json(new ApiResponse(
          "Role permissions retrieved successfully",
          await service.getRolePermissions(req.params.id),
        ));
      } catch (error) {
        next(error);
      }
    },

    async updateRolePermissions(req, res, next) {
      try {
        const permissions = req.body.permissionIds ?? req.body.permissions;
        res.status(200).json(new ApiResponse(
          "Role permissions updated successfully",
          await service.updateRolePermissions(
            req.params.id,
            permissions,
            actor(req).roles,
            actor(req).permissions,
          ),
        ));
      } catch (error) {
        next(error);
      }
    },

    async getUserAccess(req, res, next) {
      try {
        res.status(200).json(new ApiResponse(
          "User access retrieved successfully",
          await service.getUserAccess(req.params.id),
        ));
      } catch (error) {
        next(error);
      }
    },

    async updateUserAccess(req, res, next) {
      try {
        const currentActor = actor(req);
        res.status(200).json(new ApiResponse(
          "User access updated successfully",
          await service.updateUserAccess(
            currentActor.userId,
            req.params.id,
            req.body.roleIds,
            req.body.permissionIds,
            currentActor.roles,
            currentActor.permissions,
          ),
        ));
      } catch (error) {
        next(error);
      }
    },

    async updateUserPermissionOverrides(req, res, next) {
      try {
        const currentActor = actor(req);
        res.status(200).json(new ApiResponse(
          "User permission overrides updated successfully",
          await service.updateUserPermissionOverrides(
            currentActor.userId,
            req.params.id,
            req.body.grantPermissionIds,
            req.body.denyPermissionIds,
            currentActor.roles,
            currentActor.permissions,
          ),
        ));
      } catch (error) {
        next(error);
      }
    },

    async getEffectivePermissions(req, res, next) {
      try {
        res.status(200).json(new ApiResponse(
          "Effective permissions retrieved successfully",
          await service.getEffectivePermissions(req.params.id),
        ));
      } catch (error) {
        next(error);
      }
    },
  };
}

module.exports = createRbacController;
