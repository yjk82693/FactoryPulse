"""Backend-owned synthetic Console templates. No measured RF baseline is implied."""
from backend.common import now

KINDS = ('press', 'picker', 'conveyor')
PHASES = (
    [('approach', .28, 6), ('press', .82, 8), ('retract', .24, 6)],
    [('reach', .35, 5), ('grip', .7, 4), ('place', .4, 5)],
    [('idle-belt', .18, 4), ('flow', .55, 10)],
)
TEMPLATES = [dict(id=f'tpl-{kind}', name=f'{kind.title()} cycle', machine_kind=kind, version=1,
                  phases=[dict(id=p, name=p.upper(), expected_activity=a, duration_ticks=t)
                          for p, a, t in phases]) for kind, phases in zip(KINDS, PHASES)]


def empty_catalog():
    return {key: [] for key in ('zones', 'profiles', 'profile_versions', 'calibrations', 'machines', 'sensors', 'sensing_links')}


def demo_catalog():
    catalog = empty_catalog()
    catalog['zones'] = [dict(id='zone-a', name='Zone A — press cell'), dict(id='zone-b', name='Zone B — packing aisle')]
    for template in TEMPLATES:
        kind = template['machine_kind']
        pid = f'prf-{kind}-1'
        catalog['profiles'].append(dict(id=pid, template_id=template['id'], name=f'{kind.title()} baseline',
                                        machine_kind=kind, current_version=1, created_at=now()))
        catalog['profile_versions'].append(dict(id=f'{pid}-v1', profile_id=pid, version=1,
                                                phases=template['phases'], created_at=now(), created_by='dev-user'))
    return catalog
