use serde_json::{json, Value};

use crate::error::ApiError;

#[derive(Debug, Clone, PartialEq, Eq)]
enum Field {
    Text,
    From,
    To,
    Subject,
    Body,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct Term {
    field: Field,
    value: String,
}

pub fn search_filter(query: &str, mailbox_id: Option<&str>) -> Result<Value, ApiError> {
    let query = query.trim();
    if query.is_empty() {
        return Err(ApiError::BadRequest("Falta la búsqueda".into()));
    }

    let mut conditions = Vec::new();
    if let Some(mailbox_id) = mailbox_id.map(str::trim).filter(|id| !id.is_empty()) {
        conditions.push(json!({ "inMailbox": mailbox_id }));
    }

    let normalized = query.to_lowercase();
    if matches!(normalized.as_str(), "no leidos" | "no leídos" | "unread") {
        conditions.push(json!({ "notKeyword": "$seen" }));
        return Ok(wrap(conditions));
    }

    let terms = parse_terms(query);
    let prefixed = terms.iter().any(|term| term.field != Field::Text);
    if prefixed {
        for term in terms {
            conditions.push(term_json(&term));
        }
    } else {
        let text = terms
            .iter()
            .map(|term| term.value.as_str())
            .collect::<Vec<_>>()
            .join(" ");
        conditions.push(json!({
            "operator": "OR",
            "conditions": [
                {"text": text},
                {"from": text},
                {"to": text},
                {"subject": text},
                {"body": text}
            ]
        }));
    }

    Ok(wrap(conditions))
}

fn wrap(conditions: Vec<Value>) -> Value {
    if conditions.len() == 1 {
        return conditions.into_iter().next().unwrap_or(json!({}));
    }
    json!({
        "operator": "AND",
        "conditions": conditions
    })
}

fn term_json(term: &Term) -> Value {
    let key = match term.field {
        Field::Text => "text",
        Field::From => "from",
        Field::To => "to",
        Field::Subject => "subject",
        Field::Body => "body",
    };
    json!({ key: term.value })
}

fn parse_terms(query: &str) -> Vec<Term> {
    tokenize(query)
        .into_iter()
        .map(|token| {
            if let Some((field, value)) = split_field(&token) {
                Term { field, value }
            } else {
                Term {
                    field: Field::Text,
                    value: token,
                }
            }
        })
        .collect()
}

fn split_field(token: &str) -> Option<(Field, String)> {
    let lower = token.to_lowercase();
    let pairs = [
        ("from:", Field::From),
        ("to:", Field::To),
        ("subject:", Field::Subject),
        ("body:", Field::Body),
        ("text:", Field::Text),
    ];
    for (prefix, field) in pairs {
        if let Some(value) = lower.strip_prefix(prefix) {
            if value.is_empty() {
                return None;
            }
            let raw = token[prefix.len()..].trim().to_string();
            if raw.is_empty() {
                return None;
            }
            return Some((field, raw));
        }
    }
    None
}

fn tokenize(input: &str) -> Vec<String> {
    let mut tokens = Vec::new();
    let mut current = String::new();
    let mut quoted = false;
    for ch in input.chars() {
        match ch {
            '"' => quoted = !quoted,
            c if c.is_whitespace() && !quoted => {
                if !current.is_empty() {
                    tokens.push(std::mem::take(&mut current));
                }
            }
            c => current.push(c),
        }
    }
    if !current.is_empty() {
        tokens.push(current);
    }
    tokens
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn plain_query_uses_text_from_to_subject_and_body() {
        let filter = search_filter("monografía", None).unwrap();
        let conditions = filter["conditions"].as_array().unwrap();
        let keys: Vec<&str> = conditions
            .iter()
            .map(|item| item.as_object().unwrap().keys().next().unwrap().as_str())
            .collect();
        assert_eq!(keys, vec!["text", "from", "to", "subject", "body"]);
        assert_eq!(conditions[0]["text"], "monografía");
        assert_eq!(conditions[4]["body"], "monografía");
    }

    #[test]
    fn operators_and_mailbox_are_combined() {
        let filter = search_filter("from:elena subject:\"nota final\" prensa", Some("in")).unwrap();
        assert_eq!(filter["operator"], "AND");
        let conditions = filter["conditions"].as_array().unwrap();
        assert_eq!(conditions[0]["inMailbox"], "in");
        assert_eq!(conditions[1]["from"], "elena");
        assert_eq!(conditions[2]["subject"], "nota final");
        assert_eq!(conditions[3]["text"], "prensa");
    }

    #[test]
    fn unread_alias_uses_keyword_filter() {
        let filter = search_filter("no leídos", Some("in")).unwrap();
        let conditions = filter["conditions"].as_array().unwrap();
        assert_eq!(conditions[0]["inMailbox"], "in");
        assert_eq!(conditions[1]["notKeyword"], "$seen");
    }

    #[test]
    fn empty_query_is_rejected() {
        assert!(search_filter("   ", None).is_err());
    }
}
