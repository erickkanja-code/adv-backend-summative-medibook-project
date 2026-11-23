const AppError = require('../utils/AppError');
const { assertValid, parseId } = require('../validators/common');

/**
 * Builds the standard REST handlers for a simple resource so patients and
 * doctors share one implementation instead of two copies.
 *   model     - { findAll, findById, create, update, remove }
 *   validate  - (body, { partial }) => { value, errors }
 *   label     - human name used in messages, e.g. 'Patient'
 *   basePath  - used for the Location header, e.g. '/api/patients'
 */
function createCrudController({ model, validate, label, basePath }) {
  const notFoundCode = `${label.toUpperCase()}_NOT_FOUND`;
  const invalidMessage = `Invalid ${label.toLowerCase()} data`;

  function notFound(id) {
    return AppError.notFound(`${label} ${id} not found`, notFoundCode);
  }

  async function list(req, res) {
    res.json(await model.findAll());
  }

  async function getById(req, res) {
    const id = parseId(req.params.id);
    const record = await model.findById(id);
    if (!record) throw notFound(id);
    res.json(record);
  }

  async function create(req, res) {
    const data = assertValid(validate(req.body), invalidMessage);
    const record = await model.create(data);
    res.status(201).location(`${basePath}/${record.id}`).json(record);
  }

  // PUT replaces every field (all required); PATCH changes only the fields sent.
  function makeUpdate(partial) {
    return async function update(req, res) {
      const id = parseId(req.params.id);
      const data = assertValid(validate(req.body, { partial }), invalidMessage);
      const record = await model.update(id, data);
      if (!record) throw notFound(id);
      res.json(record);
    };
  }

  async function remove(req, res) {
    const id = parseId(req.params.id);
    const deleted = await model.remove(id);
    if (!deleted) throw notFound(id);
    res.status(204).end();
  }

  return { list, getById, create, replace: makeUpdate(false), update: makeUpdate(true), remove };
}

module.exports = createCrudController;
