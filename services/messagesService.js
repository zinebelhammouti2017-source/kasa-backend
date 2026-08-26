function createHttpError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function mapConversationRow(row) {
  return {
    id: row.id,
    property: {
      id: row.property_id,
      title: row.property_title,
      cover: row.property_cover,
    },
    participant: {
      id: row.participant_id,
      name: row.participant_name,
      picture: row.participant_picture,
    },
    last_message: row.last_message_id
      ? {
          id: row.last_message_id,
          content: row.last_message_content,
          sender_id: row.last_message_sender_id,
          is_read: Boolean(row.last_message_is_read),
          created_at: row.last_message_created_at,
        }
      : null,
    unread_count: Number(row.unread_count || 0),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function mapMessageRow(row) {
  return {
    id: row.id,
    conversation_id: row.conversation_id,
    content: row.content,
    sender: {
      id: row.sender_id,
      name: row.sender_name,
      picture: row.sender_picture,
    },
    is_read: Boolean(row.is_read),
    created_at: row.created_at,
  };
}

async function getConversationForParticipant(db, conversationId, userId) {
  const conversation = await db.getAsync(
    `SELECT
       c.id,
       c.property_id,
       c.client_id,
       c.host_id,
       c.created_at,
       c.updated_at,
       p.title AS property_title,
       p.cover AS property_cover
     FROM conversations c
     JOIN properties p ON p.id = c.property_id
     WHERE c.id = ?
       AND (c.client_id = ? OR c.host_id = ?)`,
    [conversationId, userId, userId]
  );

  if (!conversation) {
    throw createHttpError('Conversation not found', 404);
  }

  return conversation;
}

async function listConversations(db, userId) {
  const rows = await db.allAsync(
    `SELECT
       c.id,
       c.property_id,
       c.created_at,
       c.updated_at,
       p.title AS property_title,
       p.cover AS property_cover,
       CASE WHEN c.client_id = ? THEN host.id ELSE client.id END AS participant_id,
       CASE WHEN c.client_id = ? THEN host.name ELSE client.name END AS participant_name,
       CASE WHEN c.client_id = ? THEN host.picture ELSE client.picture END AS participant_picture,
       last_message.id AS last_message_id,
       last_message.content AS last_message_content,
       last_message.sender_id AS last_message_sender_id,
       last_message.is_read AS last_message_is_read,
       last_message.created_at AS last_message_created_at,
       (
         SELECT COUNT(*)
         FROM messages unread
         WHERE unread.conversation_id = c.id
           AND unread.sender_id != ?
           AND unread.is_read = 0
       ) AS unread_count
     FROM conversations c
     JOIN properties p ON p.id = c.property_id
     JOIN users client ON client.id = c.client_id
     JOIN users host ON host.id = c.host_id
     LEFT JOIN messages last_message ON last_message.id = (
       SELECT recent.id
       FROM messages recent
       WHERE recent.conversation_id = c.id
       ORDER BY recent.created_at DESC, recent.id DESC
       LIMIT 1
     )
     WHERE c.client_id = ? OR c.host_id = ?
     ORDER BY COALESCE(last_message.created_at, c.updated_at) DESC, c.id DESC`,
    [userId, userId, userId, userId, userId, userId]
  );

  return rows.map(mapConversationRow);
}

async function createOrGetConversation(db, userId, propertyId) {
  if (!propertyId) {
    throw createHttpError('property_id is required', 400);
  }

  const property = await db.getAsync(
    'SELECT id, host_id FROM properties WHERE id = ?',
    [propertyId]
  );

  if (!property) {
    throw createHttpError('Property not found', 404);
  }

  if (Number(property.host_id) === Number(userId)) {
    throw createHttpError('You cannot contact yourself about your own property', 400);
  }

  await db.runAsync(
    `INSERT OR IGNORE INTO conversations(property_id, client_id, host_id)
     VALUES (?, ?, ?)`,
    [property.id, userId, property.host_id]
  );

  const conversation = await db.getAsync(
    `SELECT id, property_id, client_id, host_id, created_at, updated_at
     FROM conversations
     WHERE property_id = ? AND client_id = ? AND host_id = ?`,
    [property.id, userId, property.host_id]
  );

  return conversation;
}

async function getMessages(db, conversationId, userId) {
  const conversation = await getConversationForParticipant(
    db,
    conversationId,
    userId
  );

  const rows = await db.allAsync(
    `SELECT
       m.id,
       m.conversation_id,
       m.content,
       m.sender_id,
       m.is_read,
       m.created_at,
       u.name AS sender_name,
       u.picture AS sender_picture
     FROM messages m
     JOIN users u ON u.id = m.sender_id
     WHERE m.conversation_id = ?
     ORDER BY m.created_at ASC, m.id ASC`,
    [conversationId]
  );

  return {
    conversation: {
      id: conversation.id,
      property: {
        id: conversation.property_id,
        title: conversation.property_title,
        cover: conversation.property_cover,
      },
      client_id: conversation.client_id,
      host_id: conversation.host_id,
      created_at: conversation.created_at,
      updated_at: conversation.updated_at,
    },
    messages: rows.map(mapMessageRow),
  };
}

async function sendMessage(db, conversationId, userId, content) {
  await getConversationForParticipant(db, conversationId, userId);

  const normalizedContent = String(content || '').trim();
  if (!normalizedContent) {
    throw createHttpError('content is required', 400);
  }

  const result = await db.runAsync(
    `INSERT INTO messages(conversation_id, sender_id, content)
     VALUES (?, ?, ?)`,
    [conversationId, userId, normalizedContent]
  );

  await db.runAsync(
    'UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [conversationId]
  );

  const row = await db.getAsync(
    `SELECT
       m.id,
       m.conversation_id,
       m.content,
       m.sender_id,
       m.is_read,
       m.created_at,
       u.name AS sender_name,
       u.picture AS sender_picture
     FROM messages m
     JOIN users u ON u.id = m.sender_id
     WHERE m.id = ?`,
    [result.lastID]
  );

  return mapMessageRow(row);
}

async function markAsRead(db, conversationId, userId) {
  await getConversationForParticipant(db, conversationId, userId);

  const result = await db.runAsync(
    `UPDATE messages
     SET is_read = 1
     WHERE conversation_id = ?
       AND sender_id != ?
       AND is_read = 0`,
    [conversationId, userId]
  );

  return { updated: result.changes };
}

module.exports = {
  listConversations,
  createOrGetConversation,
  getMessages,
  sendMessage,
  markAsRead,
};