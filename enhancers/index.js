const createdBy = require('sequelize-extension-createdby');
const deletedBy = require('sequelize-extension-deletedby');
const updatedBy = require('sequelize-extension-updatedby');
const tracking = require('sequelize-extension-tracking');
const graphql = require('sequelize-extension-graphql');

Object.assign(exports, {
  createdBy,
  deletedBy,
  updatedBy,
  tracking,
  graphql,
});
