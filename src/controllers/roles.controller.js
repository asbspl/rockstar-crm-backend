const ApiResponse = require("../utils/ApiResponse");

function createRolesController(userService) {
  return {
    async listRoles(req, res, next) {
      try {
        const data = await userService.listRoles();
        res.status(200).json(new ApiResponse("Roles retrieved successfully", data));
      } catch (error) {
        next(error);
      }
    },

    async listPermissions(req, res, next) {
      try {
        const data = await userService.listPermissions();
        res.status(200).json(new ApiResponse("Permissions retrieved successfully", data));
      } catch (error) {
        next(error);
      }
    },

    async getRolePermissions(req, res, next) {
      try {
        const data = await userService.getRolePermissions(req.params.id);
        res.status(200).json(new ApiResponse("Role permissions retrieved successfully", data));
      } catch (error) {
        next(error);
      }
    },

    async updateRolePermissions(req, res, next) {
      try {
        const data = await userService.updateRolePermissions(req.params.id, req.body.permissions);
        res.status(200).json(new ApiResponse("Role permissions updated successfully", data));
      } catch (error) {
        next(error);
      }
    },
  };
}

module.exports = createRolesController;
