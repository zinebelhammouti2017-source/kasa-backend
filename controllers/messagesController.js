const {
  listConversations,
  createOrGetConversation,
  getMessages,
  sendMessage,
  markAsRead,
} = require('../services/messagesService');

function statusFromError(error) {
  if (error && error.status) return error.status;
  if (error && error.message && /FOREIGN KEY/i.test(error.message)) return 400;
  return 500;
}

async function list(req, res) {
  const db = req.app.locals.db;

  try {
    const conversations = await listConversations(db, req.user.id);
    res.json(conversations);
  } catch (error) {
    res.status(statusFromError(error)).json({ error: error.message });
  }
}

async function create(req, res) {
  const db = req.app.locals.db;

  try {
    const conversation = await createOrGetConversation(
      db,
      req.user.id,
      req.body && req.body.property_id
    );
    res.status(201).json(conversation);
  } catch (error) {
    res.status(statusFromError(error)).json({ error: error.message });
  }
}

async function getConversationMessages(req, res) {
  const db = req.app.locals.db;

  try {
    const result = await getMessages(db, req.params.id, req.user.id);
    res.json(result);
  } catch (error) {
    res.status(statusFromError(error)).json({ error: error.message });
  }
}

async function createMessage(req, res) {
  const db = req.app.locals.db;

  try {
    const message = await sendMessage(
      db,
      req.params.id,
      req.user.id,
      req.body && req.body.content
    );
    res.status(201).json(message);
  } catch (error) {
    res.status(statusFromError(error)).json({ error: error.message });
  }
}

async function read(req, res) {
  const db = req.app.locals.db;

  try {
    const result = await markAsRead(db, req.params.id, req.user.id);
    res.json(result);
  } catch (error) {
    res.status(statusFromError(error)).json({ error: error.message });
  }
}

module.exports = {
  list,
  create,
  getConversationMessages,
  createMessage,
  read,
};