use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::path::Path;

pub const SCHEMA_VERSION: i64 = 1;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredConversation {
    pub id: String,
    pub title: String,
    pub created_at: String,
    pub updated_at: String,
    pub active_model: Option<String>,
    pub metadata_json: String,
    pub messages: Vec<StoredMessage>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConversationSummary {
    pub id: String,
    pub title: String,
    pub created_at: String,
    pub updated_at: String,
    pub active_model: Option<String>,
    pub message_count: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredMessage {
    pub id: String,
    pub conversation_id: String,
    pub role: MessageRole,
    pub content: String,
    pub created_at: String,
    pub status: MessageStatus,
    pub position: u32,
    pub metadata_json: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum MessageRole {
    System,
    User,
    Assistant,
}

impl MessageRole {
    fn as_str(&self) -> &'static str {
        match self {
            Self::System => "system",
            Self::User => "user",
            Self::Assistant => "assistant",
        }
    }

    fn from_str(value: &str) -> rusqlite::Result<Self> {
        match value {
            "system" => Ok(Self::System),
            "user" => Ok(Self::User),
            "assistant" => Ok(Self::Assistant),
            _ => Err(rusqlite::Error::InvalidQuery),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum MessageStatus {
    Complete,
    Streaming,
    Cancelled,
    Failed,
    Partial,
}

impl MessageStatus {
    fn as_str(&self) -> &'static str {
        match self {
            Self::Complete => "complete",
            Self::Streaming => "streaming",
            Self::Cancelled => "cancelled",
            Self::Failed => "failed",
            Self::Partial => "partial",
        }
    }

    fn from_str(value: &str) -> rusqlite::Result<Self> {
        match value {
            "complete" => Ok(Self::Complete),
            "streaming" => Ok(Self::Streaming),
            "cancelled" => Ok(Self::Cancelled),
            "failed" => Ok(Self::Failed),
            "partial" => Ok(Self::Partial),
            _ => Err(rusqlite::Error::InvalidQuery),
        }
    }
}

pub struct ConversationStore {
    connection: Connection,
}

impl ConversationStore {
    pub fn open(path: impl AsRef<Path>) -> rusqlite::Result<Self> {
        let connection = Connection::open(path)?;
        let store = Self { connection };
        store.initialize()?;
        Ok(store)
    }

    pub fn in_memory() -> rusqlite::Result<Self> {
        let connection = Connection::open_in_memory()?;
        let store = Self { connection };
        store.initialize()?;
        Ok(store)
    }

    fn initialize(&self) -> rusqlite::Result<()> {
        self.connection.execute_batch(
            "
            PRAGMA foreign_keys = ON;

            CREATE TABLE IF NOT EXISTS schema_version (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                version INTEGER NOT NULL
            );

            INSERT INTO schema_version (id, version)
            VALUES (1, 1)
            ON CONFLICT(id) DO UPDATE SET version = excluded.version;

            CREATE TABLE IF NOT EXISTS conversations (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                active_model TEXT,
                metadata_json TEXT NOT NULL DEFAULT '{}'
            );

            CREATE TABLE IF NOT EXISTS messages (
                id TEXT PRIMARY KEY,
                conversation_id TEXT NOT NULL,
                role TEXT NOT NULL CHECK (role IN ('system', 'user', 'assistant')),
                content TEXT NOT NULL,
                created_at TEXT NOT NULL,
                status TEXT NOT NULL CHECK (status IN ('complete', 'streaming', 'cancelled', 'failed', 'partial')),
                position INTEGER NOT NULL,
                metadata_json TEXT NOT NULL DEFAULT '{}',
                FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
                UNIQUE(conversation_id, position)
            );

            CREATE INDEX IF NOT EXISTS idx_conversations_updated_at
                ON conversations(updated_at DESC);

            CREATE INDEX IF NOT EXISTS idx_messages_conversation_position
                ON messages(conversation_id, position);
            ",
        )
    }

    pub fn schema_version(&self) -> rusqlite::Result<i64> {
        self.connection.query_row(
            "SELECT version FROM schema_version WHERE id = 1",
            [],
            |row| row.get(0),
        )
    }

    pub fn save_conversation(&mut self, conversation: &StoredConversation) -> rusqlite::Result<()> {
        let transaction = self.connection.transaction()?;

        transaction.execute(
            "
            INSERT INTO conversations (id, title, created_at, updated_at, active_model, metadata_json)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6)
            ON CONFLICT(id) DO UPDATE SET
                title = excluded.title,
                created_at = excluded.created_at,
                updated_at = excluded.updated_at,
                active_model = excluded.active_model,
                metadata_json = excluded.metadata_json
            ",
            params![
                conversation.id,
                conversation.title,
                conversation.created_at,
                conversation.updated_at,
                conversation.active_model,
                conversation.metadata_json
            ],
        )?;

        transaction.execute(
            "DELETE FROM messages WHERE conversation_id = ?1",
            params![conversation.id],
        )?;

        for message in &conversation.messages {
            transaction.execute(
                "
                INSERT INTO messages (
                    id,
                    conversation_id,
                    role,
                    content,
                    created_at,
                    status,
                    position,
                    metadata_json
                )
                VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
                ",
                params![
                    message.id,
                    message.conversation_id,
                    message.role.as_str(),
                    message.content,
                    message.created_at,
                    message.status.as_str(),
                    message.position,
                    message.metadata_json
                ],
            )?;
        }

        transaction.commit()
    }

    pub fn load_conversation(&self, id: &str) -> rusqlite::Result<Option<StoredConversation>> {
        let conversation = self
            .connection
            .query_row(
                "
                SELECT id, title, created_at, updated_at, active_model, metadata_json
                FROM conversations
                WHERE id = ?1
                ",
                params![id],
                |row| {
                    Ok(StoredConversation {
                        id: row.get(0)?,
                        title: row.get(1)?,
                        created_at: row.get(2)?,
                        updated_at: row.get(3)?,
                        active_model: row.get(4)?,
                        metadata_json: row.get(5)?,
                        messages: Vec::new(),
                    })
                },
            )
            .optional()?;

        let Some(mut conversation) = conversation else {
            return Ok(None);
        };

        conversation.messages = self.load_messages(id)?;
        Ok(Some(conversation))
    }

    pub fn delete_conversation(&self, id: &str) -> rusqlite::Result<bool> {
        let deleted = self
            .connection
            .execute("DELETE FROM conversations WHERE id = ?1", params![id])?;

        Ok(deleted > 0)
    }

    pub fn rename_conversation(
        &self,
        id: &str,
        title: &str,
        updated_at: &str,
    ) -> rusqlite::Result<bool> {
        let updated = self.connection.execute(
            "
            UPDATE conversations
            SET title = ?2, updated_at = ?3
            WHERE id = ?1
            ",
            params![id, title, updated_at],
        )?;

        Ok(updated > 0)
    }

    pub fn list_conversations(&self) -> rusqlite::Result<Vec<ConversationSummary>> {
        let mut statement = self.connection.prepare(
            "
            SELECT
                conversations.id,
                conversations.title,
                conversations.created_at,
                conversations.updated_at,
                conversations.active_model,
                COUNT(messages.id) AS message_count
            FROM conversations
            LEFT JOIN messages ON messages.conversation_id = conversations.id
            GROUP BY conversations.id
            ORDER BY conversations.updated_at DESC
            ",
        )?;

        let rows = statement.query_map([], |row| {
            let message_count: i64 = row.get(5)?;
            Ok(ConversationSummary {
                id: row.get(0)?,
                title: row.get(1)?,
                created_at: row.get(2)?,
                updated_at: row.get(3)?,
                active_model: row.get(4)?,
                message_count: message_count.max(0) as u32,
            })
        })?;

        rows.collect()
    }

    fn load_messages(&self, conversation_id: &str) -> rusqlite::Result<Vec<StoredMessage>> {
        let mut statement = self.connection.prepare(
            "
            SELECT id, conversation_id, role, content, created_at, status, position, metadata_json
            FROM messages
            WHERE conversation_id = ?1
            ORDER BY position ASC
            ",
        )?;

        let rows = statement.query_map(params![conversation_id], |row| {
            let role: String = row.get(2)?;
            let status: String = row.get(5)?;
            Ok(StoredMessage {
                id: row.get(0)?,
                conversation_id: row.get(1)?,
                role: MessageRole::from_str(&role)?,
                content: row.get(3)?,
                created_at: row.get(4)?,
                status: MessageStatus::from_str(&status)?,
                position: row.get(6)?,
                metadata_json: row.get(7)?,
            })
        })?;

        rows.collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_conversation() -> StoredConversation {
        StoredConversation {
            id: "conversation-1".to_string(),
            title: "Aether roadmap".to_string(),
            created_at: "2026-07-15T02:00:00Z".to_string(),
            updated_at: "2026-07-15T02:05:00Z".to_string(),
            active_model: Some("qwen3:8b".to_string()),
            metadata_json: "{}".to_string(),
            messages: vec![
                StoredMessage {
                    id: "message-1".to_string(),
                    conversation_id: "conversation-1".to_string(),
                    role: MessageRole::User,
                    content: "What should v0.2 include?".to_string(),
                    created_at: "2026-07-15T02:00:00Z".to_string(),
                    status: MessageStatus::Complete,
                    position: 0,
                    metadata_json: "{}".to_string(),
                },
                StoredMessage {
                    id: "message-2".to_string(),
                    conversation_id: "conversation-1".to_string(),
                    role: MessageRole::Assistant,
                    content: "Conversation history and persistence.".to_string(),
                    created_at: "2026-07-15T02:01:00Z".to_string(),
                    status: MessageStatus::Cancelled,
                    position: 1,
                    metadata_json: r#"{"cancelled":true}"#.to_string(),
                },
            ],
        }
    }

    #[test]
    fn initializes_schema_version() {
        let store = ConversationStore::in_memory().expect("store opens");

        assert_eq!(
            store.schema_version().expect("schema version"),
            SCHEMA_VERSION
        );
    }

    #[test]
    fn saves_and_loads_conversation_with_ordered_messages() {
        let mut store = ConversationStore::in_memory().expect("store opens");
        let conversation = sample_conversation();

        store
            .save_conversation(&conversation)
            .expect("conversation saves");

        let loaded = store
            .load_conversation("conversation-1")
            .expect("conversation loads")
            .expect("conversation exists");

        assert_eq!(loaded, conversation);
        assert_eq!(loaded.messages[0].position, 0);
        assert_eq!(loaded.messages[1].status, MessageStatus::Cancelled);
    }

    #[test]
    fn lists_conversations_by_recent_update() {
        let mut store = ConversationStore::in_memory().expect("store opens");
        let mut older = sample_conversation();
        older.id = "older".to_string();
        older.title = "Older".to_string();
        older.updated_at = "2026-07-15T01:00:00Z".to_string();
        for (index, message) in older.messages.iter_mut().enumerate() {
            message.id = format!("older-message-{index}");
            message.conversation_id = older.id.clone();
        }

        let mut newer = sample_conversation();
        newer.id = "newer".to_string();
        newer.title = "Newer".to_string();
        newer.updated_at = "2026-07-15T03:00:00Z".to_string();
        for (index, message) in newer.messages.iter_mut().enumerate() {
            message.id = format!("newer-message-{index}");
            message.conversation_id = newer.id.clone();
        }

        store.save_conversation(&older).expect("older saves");
        store.save_conversation(&newer).expect("newer saves");

        let summaries = store.list_conversations().expect("summaries load");

        assert_eq!(summaries.len(), 2);
        assert_eq!(summaries[0].id, "newer");
        assert_eq!(summaries[0].message_count, 2);
        assert_eq!(summaries[1].id, "older");
    }

    #[test]
    fn returns_none_for_missing_conversation() {
        let store = ConversationStore::in_memory().expect("store opens");

        assert!(store
            .load_conversation("missing")
            .expect("lookup succeeds")
            .is_none());
    }

    #[test]
    fn deletes_conversation_and_messages() {
        let mut store = ConversationStore::in_memory().expect("store opens");
        store
            .save_conversation(&sample_conversation())
            .expect("conversation saves");

        assert!(store
            .delete_conversation("conversation-1")
            .expect("conversation deletes"));
        assert!(store
            .load_conversation("conversation-1")
            .expect("lookup succeeds")
            .is_none());
        assert!(store
            .list_conversations()
            .expect("summaries load")
            .is_empty());
    }

    #[test]
    fn renames_conversation_title() {
        let mut store = ConversationStore::in_memory().expect("store opens");
        store
            .save_conversation(&sample_conversation())
            .expect("conversation saves");

        assert!(store
            .rename_conversation(
                "conversation-1",
                "Renamed Aether roadmap",
                "2026-07-15T02:10:00Z"
            )
            .expect("conversation renames"));

        let loaded = store
            .load_conversation("conversation-1")
            .expect("conversation loads")
            .expect("conversation exists");

        assert_eq!(loaded.title, "Renamed Aether roadmap");
        assert_eq!(loaded.updated_at, "2026-07-15T02:10:00Z");
    }

    #[test]
    fn can_open_file_backed_database() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let db_path = temp_dir.path().join("aether.sqlite");

        {
            let mut store = ConversationStore::open(&db_path).expect("file store opens");
            store
                .save_conversation(&sample_conversation())
                .expect("conversation saves");
        }

        let store = ConversationStore::open(&db_path).expect("file store reopens");
        let loaded = store
            .load_conversation("conversation-1")
            .expect("conversation loads")
            .expect("conversation exists");

        assert_eq!(loaded.title, "Aether roadmap");
        assert_eq!(loaded.messages.len(), 2);
    }
}
