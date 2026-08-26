const {
  listProperties,
  getPropertyDetails,
  createProperty,
  updateProperty,
  deleteProperty,
  getPropertyOwnerId,
} = require("../services/propertiesService");

function statusFromError(error) {
  if (error && error.status) return error.status;

  if (
    error &&
    error.message &&
    /(UNIQUE|PRIMARY KEY)/i.test(error.message)
  ) {
    return 409;
  }

  return 500;
}

async function checkPropertyPermission(db, propertyId, user) {
  if (!user || !user.id) {
    const error = new Error("Authentication required");
    error.status = 401;
    throw error;
  }

  const ownerId = await getPropertyOwnerId(db, propertyId);

  if (ownerId === null) {
    const error = new Error("Property not found");
    error.status = 404;
    throw error;
  }

  const isAdmin = user.role === "admin";
  const isOwner = String(ownerId) === String(user.id);

  if (!isAdmin && !isOwner) {
    const error = new Error(
      "You are not allowed to manage this property"
    );
    error.status = 403;
    throw error;
  }
}

async function list(req, res) {
  const db = req.app.locals.db;

  try {
    const rows = await listProperties(db);
    res.json(rows);
  } catch (error) {
    res
      .status(statusFromError(error))
      .json({ error: error.message });
  }
}

async function getById(req, res) {
  const db = req.app.locals.db;

  try {
    const property = await getPropertyDetails(
      db,
      req.params.id
    );

    if (!property) {
      return res
        .status(404)
        .json({ error: "Property not found" });
    }

    res.json(property);
  } catch (error) {
    res
      .status(statusFromError(error))
      .json({ error: error.message });
  }
}

async function create(req, res) {
  const db = req.app.locals.db;

  try {
    const createdProperty = await createProperty(
      db,
      req.body || {},
      req.user?.id
    );

    res.status(201).json(createdProperty);
  } catch (error) {
    const status = statusFromError(error);

    let message = error.message;

    if (status === 409) {
      message = "Property with same id already exists";
    }

    res.status(status).json({ error: message });
  }
}

async function update(req, res) {
  const db = req.app.locals.db;

  try {
    await checkPropertyPermission(
      db,
      req.params.id,
      req.user
    );

    const updatedProperty = await updateProperty(
      db,
      req.params.id,
      req.body || {}
    );

    res.json(updatedProperty);
  } catch (error) {
    res
      .status(statusFromError(error))
      .json({ error: error.message });
  }
}

async function remove(req, res) {
  const db = req.app.locals.db;

  try {
    await checkPropertyPermission(
      db,
      req.params.id,
      req.user
    );

    await deleteProperty(db, req.params.id);

    res.status(204).end();
  } catch (error) {
    res
      .status(statusFromError(error))
      .json({ error: error.message });
  }
}

module.exports = {
  list,
  getById,
  create,
  update,
  remove,
};