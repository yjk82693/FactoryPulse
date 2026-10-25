"""Trusted-context briefing text. Clients cannot supply spoken or Gemini prompt text."""
import json

DISCLAIMER = (
    'This is an operational observation for review. It is not a confirmed machine fault, '
    'safety incident, identity, or location.'
)

MAX_SPEECH = 300
MAX_EXPLANATION = 2000


def trusted_evidence(hub, alert: dict) -> dict:
    related_ids = set(alert.get('related_event_ids') or [])
    related = []
    allowed = ('activity_score', 'threshold', 'method', 'step', 'cycle_id', 'duration_ms', 'expected_ms')
    for event in hub.events:
        if event.get('event_id') in related_ids:
            payload = event.get('payload') if isinstance(event.get('payload'), dict) else {}
            stored = {field: payload[field] for field in allowed if field in payload}
            related.append(dict(
                event_type=event.get('event_type'),
                timestamp=event.get('timestamp'),
                source=event.get('source'),
                **stored,
            ))
    return dict(
        alert=dict(
            alert_id=alert.get('alert_id'),
            rule=alert.get('rule'),
            severity=alert.get('severity'),
            message=alert.get('message'),
            created_at=alert.get('created_at'),
            cycle_id=alert.get('cycle_id'),
            related_event_ids=list(related_ids),
        ),
        machine_id=hub.machine.get('machine_id'),
        current_step=hub.machine.get('current_step'),
        machine_simulated=hub.machine.get('simulated'),
        sensor_method=hub.sensor.get('method'),
        related_events=related,
    )


def spoken_text(hub, alert: dict) -> str:
    machine_id = hub.machine.get('machine_id') or 'assembly_01'
    text = f"FactoryPulse {alert.get('severity')} alert for {machine_id}. {alert.get('message', '')}".strip()
    if alert.get('rule') in ('ACTIVITY_REVIEW', 'ACTIVITY_INFO'):
        text = f'{text} This is an operational observation for review.'
    return text[:MAX_SPEECH]


def gemini_prompt(evidence: dict) -> str:
    return (
        'You explain FactoryPulse operational alerts for a factory operator.\n'
        'Use ONLY the evidence JSON below. Do not invent people, locations, or a confirmed machine fault.\n'
        'Wi-Fi CSI / activity_score is an operational observation of radio-channel change, not a diagnosis.\n'
        'Never say the machine has failed, is broken, or that CSI identified a person.\n'
        'Respond with JSON only: '
        '{"observations":[string],"hypotheses":[string],"recommended_checks":[string],"summary":string}\n'
        'Hypotheses must be phrased as possible interpretations, not facts.\n'
        f'Evidence: {json.dumps(evidence, separators=(",", ":"))}'
    )


def format_explanation(raw: str) -> str:
    trimmed = (raw or '').strip()
    parsed = _parse_json_object(trimmed)
    if parsed:
        parts = []
        summary = parsed.get('summary')
        if isinstance(summary, str) and summary.strip():
            parts.append(summary.strip())
        for key, label in (
            ('observations', 'Observations'),
            ('hypotheses', 'Possible interpretations'),
            ('recommended_checks', 'Recommended checks'),
        ):
            items = parsed.get(key)
            if isinstance(items, list):
                lines = [item.strip() for item in items if isinstance(item, str) and item.strip()]
                if lines:
                    parts.append(label + ': ' + '; '.join(lines))
        parts.append(DISCLAIMER)
        trimmed = '\n'.join(parts)
    if DISCLAIMER.lower() not in trimmed.lower():
        trimmed = f'{trimmed}\n{DISCLAIMER}'.strip()
    return trimmed[:MAX_EXPLANATION]


def _parse_json_object(text: str) -> dict | None:
    candidate = text
    if candidate.startswith('```'):
        candidate = candidate.strip('`')
        if candidate.startswith('json'):
            candidate = candidate[4:]
        candidate = candidate.strip()
    try:
        parsed = json.loads(candidate)
    except json.JSONDecodeError:
        start, end = candidate.find('{'), candidate.rfind('}')
        if start < 0 or end <= start:
            return None
        try:
            parsed = json.loads(candidate[start:end + 1])
        except json.JSONDecodeError:
            return None
    return parsed if isinstance(parsed, dict) else None
