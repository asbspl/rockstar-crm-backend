const ApiResponse = require("../utils/ApiResponse");

function createUsersController(userService) {
  return {
    async listUsers(req, res, next) {
      try {
        const data = await userService.listUsers();
        res.status(200).json(new ApiResponse("Users retrieved successfully", data));
      } catch (error) {
        next(error);
      }
    },

    async listApplications(req, res, next) {
      try {
        const data = await userService.listApplications({
          status: req.query.status,
          search: req.query.search,
          limit: req.query.limit,
          offset: req.query.offset,
        });
        res.status(200).json(new ApiResponse("Registration applications retrieved successfully", data));
      } catch (error) {
        next(error);
      }
    },

    async getApplication(req, res, next) {
      try {
        const data = await userService.getApplication(req.params.id);
        res.status(200).json(new ApiResponse("Registration application retrieved successfully", data));
      } catch (error) {
        next(error);
      }
    },

    async approveApplication(req, res, next) {
      try {
        const data = await userService.approveApplication(req.auth.userId, req.params.id, req.body);
        res.status(200).json(new ApiResponse("Application approved successfully", data));
      } catch (error) {
        next(error);
      }
    },

    async rejectApplication(req, res, next) {
      try {
        const data = await userService.rejectApplication(req.auth.userId, req.params.id, req.body.reason);
        res.status(200).json(new ApiResponse("Application rejected successfully", data));
      } catch (error) {
        next(error);
      }
    },

    async requestCorrections(req, res, next) {
      try {
        const data = await userService.requestCorrections(req.auth.userId, req.params.id, req.body.notes);
        res.status(200).json(new ApiResponse("Correction request recorded successfully", data));
      } catch (error) {
        next(error);
      }
    },

    async getUserRoles(req, res, next) {
      try {
        const data = await userService.getUserRoles(req.params.id);
        res.status(200).json(new ApiResponse("User roles retrieved successfully", data));
      } catch (error) {
        next(error);
      }
    },

    async assignUserRoles(req, res, next) {
      try {
        const data = await userService.assignUserRoles(req.auth.userId, req.params.id, req.body.roles);
        res.status(200).json(new ApiResponse("User roles updated successfully", data));
      } catch (error) {
        next(error);
      }
    },

    async getUser(req, res, next) {
      try {
        const data = await userService.getUser(req.params.id);
        res.status(200).json(new ApiResponse("User retrieved successfully", data));
      } catch (error) {
        next(error);
      }
    },

    async createUser(req, res, next) {
      try {
        const data = await userService.createUser(req.body);
        res.status(201).json(new ApiResponse("User created successfully", data));
      } catch (error) {
        next(error);
      }
    },

    async updateUser(req, res, next) {
      try {
        const data = await userService.updateUser(req.params.id, req.body);
        res.status(200).json(new ApiResponse("User updated successfully", data));
      } catch (error) {
        next(error);
      }
    },

    async updateStatus(req, res, next) {
      try {
        const data = await userService.updateStatus(req.params.id, req.body.status);
        res.status(200).json(new ApiResponse("User status updated successfully", data));
      } catch (error) {
        next(error);
      }
    },
  };
}

module.exports = createUsersController;
