const patientModel = require('../models/patientModel');
const { validatePatient } = require('../validators/patientValidator');
const createCrudController = require('./crudControllerFactory');

module.exports = createCrudController({
  model: patientModel,
  validate: validatePatient,
  label: 'Patient',
  basePath: '/api/patients',
});
