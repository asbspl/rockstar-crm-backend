const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const ApiError = require("../utils/ApiError");
const userModel = require("../models/user.model");

function createAuthService(config) {
  return {
    async login(email, password) {
      const user = await userModel.findByEmail(email, config);
      let passwordMatches = false;
      if (user?.password_hash) {
        try {
          passwordMatches = await bcrypt.compare(password, user.password_hash);
        } catch {
          passwordMatches = false;
        }
      }
      if (!user || !passwordMatches) {
        throw new ApiError(401, "Email or password is incorrect");
      }

      const token = jwt.sign({ sub: String(user.id) }, config.jwtSecret, {
        expiresIn: config.jwtExpiresIn,
      });
      return { token, user: { id: user.id, email: user.email } };
    },

    async getCurrentUser(userId) {
      const user = await userModel.findById(userId, config);
      if (!user) throw new ApiError(401, "Authenticated user no longer exists");
      return { id: user.id, email: user.email };
    },
  };
}

module.exports = createAuthService;