class ApiResponse {
  constructor(message, data) {
    this.success = true;
    this.message = message;
    this.data = data;
  }
}

module.exports = ApiResponse;