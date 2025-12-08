export default {
  testEnvironment: "node",
  transform: {},
  roots: ["<rootDir>/tests"],
  moduleNameMapper: {
    "^@filters/(.*)$": "<rootDir>/filters/$1",
    "^@utils/(.*)$": "<rootDir>/utils/$1",
  }
};
