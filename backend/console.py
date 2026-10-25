"""Contract v1.3 Console API. Live ingest is deliberately independent."""
from copy import deepcopy
from typing import Literal, Annotated
from uuid import uuid4

from fastapi import APIRouter, Body, Depends, Request, Response
from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

from backend.auth import current, supervisor
from backend.common import fail, now
from backend.seeds import TEMPLATES

Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=250)]
Kind = Literal['press', 'picker', 'conveyor']
Status = Literal['IDLE', 'RUNNING', 'MAINTENANCE', 'STOPPED']


class Strict(BaseModel):
    model_config = ConfigDict(extra='forbid', allow_inf_nan=False)


class Phase(Strict):
    id: Name
    name: Name
    expected_activity: float = Field(ge=0, le=1)
    duration_ticks: int = Field(gt=0, strict=True)


class MachineInput(Strict):
    name: Name
    kind: Kind
    zone_id: Name
    operating_status: Status
    profile_id: Name
    live_cell_id: Literal['assembly_01'] | None = None


class MachinePatch(Strict):
    name: Name | None = None
    zone_id: Name | None = None
    operating_status: Status | None = None
    profile_id: Name | None = None
    live_cell_id: Literal['assembly_01'] | None = None

    @model_validator(mode='after')
    def nonnullable(self):
        if any(getattr(self, key) is None for key in self.model_fields_set - {'live_cell_id'}):
            raise ValueError('Only live_cell_id can be null')
        return self


class ProfileInput(Strict):
    template_id: Name
    name: Name


class VersionInput(Strict):
    phases: list[Phase] | None = Field(default=None, min_length=1, max_length=100)

    @model_validator(mode='after')
    def unique_ids(self):
        if 'phases' in self.model_fields_set and self.phases is None:
            raise ValueError('phases cannot be null')
        if self.phases and len({p.id for p in self.phases}) != len(self.phases):
            raise ValueError('Phase ids must be unique')
        return self


class CalibrationInput(Strict):
    profile_id: Name
    profile_version_id: Name
    machine_id: Name
    state: Literal['uncalibrated', 'calibrating', 'calibrated']
    notes: str = Field(default='', max_length=2000)


class LinkInput(Strict):
    name: Name
    mode: Literal['dedicated', 'shared_zone']
    zone_id: Name
    machine_ids: list[Name] = Field(max_length=500)
    physical_sensor_id: Name | None = None


def find(data, key, id):
    for row in data[key]:
        if row['id'] == id:
            return row
    fail(404, 'not_found', 'Resource not found')


def ambiguity(link, data):
    high = link['mode'] == 'shared_zone' and len(link['machine_ids']) >= 2
    names = ', '.join(find(data, 'machines', mid)['name'] for mid in link['machine_ids'])
    return dict(level='high' if high else 'low', summary=(
        f'Shared zone: {names} may produce overlapping CSI. Machine-level scores are hypotheses for operator review, not confirmed faults.'
        if high else 'Illustrative CSI path; does not provide perfect single-machine RF isolation. Scores are hypotheses for operator review.'))


def sync_links(data):
    for machine in data['machines']:
        machine['sensor_link_ids'] = [link['id'] for link in data['sensing_links'] if machine['id'] in link['machine_ids']]
    for link in data['sensing_links']:
        link['ambiguity'] = ambiguity(link, data)


def validate_machine(data, machine):
    find(data, 'zones', machine['zone_id'])
    profile = find(data, 'profiles', machine['profile_id'])
    if profile['machine_kind'] != machine['kind']:
        fail(422, 'profile_kind_mismatch', 'Profile must match machine kind')


def validate_link(data, link):
    ids = link['machine_ids']
    if link['mode'] == 'dedicated' and len(ids) != 1:
        fail(422, 'dedicated_link_requires_one_machine', 'Dedicated link requires exactly one machine')
    if not ids or len(set(ids)) != len(ids):
        fail(422, 'validation_error', 'Provide at least one unique machine')
    find(data, 'zones', link['zone_id'])
    for mid in ids:
        if find(data, 'machines', mid)['zone_id'] != link['zone_id']:
            fail(422, 'validation_error', 'Link and machines must share a zone')
    if link.get('physical_sensor_id'):
        find(data, 'sensors', link['physical_sensor_id'])


router = APIRouter(prefix='/api/console')


@router.get('/catalog')
def catalog(request: Request, identity=Depends(current)):
    with request.app.state.repository.catalog(identity.company['id']) as data:
        return dict(**data, templates=deepcopy(TEMPLATES))


@router.get('/profile-templates')
def templates(identity=Depends(current)):
    return deepcopy(TEMPLATES)


# Read resources share the exact wire collection names from the catalog.
def register_reads(path, key):
    def collection(request: Request, identity=Depends(current)):
        with request.app.state.repository.catalog(identity.company['id']) as data:
            return data[key]

    def item(id: str, request: Request, identity=Depends(current)):
        with request.app.state.repository.catalog(identity.company['id']) as data:
            return find(data, key, id)
    router.add_api_route('/' + path, collection, methods=['GET'])
    router.add_api_route('/' + path + '/{id}', item, methods=['GET'])


for path, key in [('zones', 'zones'), ('machines', 'machines'), ('sensors', 'sensors'), ('sensing-links', 'sensing_links')]:
    register_reads(path, key)


@router.post('/machines', status_code=201)
def create_machine(body: MachineInput, request: Request, identity=Depends(supervisor)):
    with request.app.state.repository.catalog(identity.company['id'], True) as data:
        machine = dict(id=str(uuid4()), **body.model_dump(), sensor_link_ids=[], created_at=now())
        validate_machine(data, machine)
        data['machines'].append(machine)
        return machine


@router.patch('/machines/{id}')
def update_machine(id: str, body: MachinePatch, request: Request, identity=Depends(supervisor)):
    with request.app.state.repository.catalog(identity.company['id'], True) as data:
        machine = find(data, 'machines', id)
        machine.update(body.model_dump(exclude_unset=True))
        validate_machine(data, machine)
        for link in data['sensing_links']:
            if id in link['machine_ids']:
                validate_link(data, link)
        sync_links(data)
        return machine


@router.delete('/machines/{id}', status_code=204)
def delete_machine(id: str, request: Request, identity=Depends(supervisor)):
    with request.app.state.repository.catalog(identity.company['id'], True) as data:
        data['machines'].remove(find(data, 'machines', id))
        for link in data['sensing_links']:
            link['machine_ids'] = [mid for mid in link['machine_ids'] if mid != id]
        # Empty links cannot satisfy the contract; remove orphan links atomically.
        data['sensing_links'] = [link for link in data['sensing_links'] if link['machine_ids']]
        data['calibrations'] = [c for c in data['calibrations'] if c['machine_id'] != id]
        sync_links(data)
    return Response(status_code=204)


@router.get('/profiles')
def profiles(request: Request, identity=Depends(current)):
    with request.app.state.repository.catalog(identity.company['id']) as data:
        return data['profiles']


def append_version(data, profile, phases, user):
    row = dict(id=str(uuid4()), profile_id=profile['id'], version=profile['current_version'],
               phases=deepcopy(phases), created_at=now(), created_by=user)
    data['profile_versions'].append(row)
    return row


@router.post('/profiles', status_code=201)
def create_profile(body: ProfileInput, request: Request, identity=Depends(supervisor)):
    template = find({'templates': TEMPLATES}, 'templates', body.template_id)
    with request.app.state.repository.catalog(identity.company['id'], True) as data:
        profile = dict(id=str(uuid4()), template_id=body.template_id, name=body.name,
                       machine_kind=template['machine_kind'], current_version=1, created_at=now())
        data['profiles'].append(profile)
        append_version(data, profile, template['phases'], identity.user['id'])
        return profile


@router.get('/profiles/{id}')
def profile(id: str, request: Request, identity=Depends(current)):
    with request.app.state.repository.catalog(identity.company['id']) as data:
        row = find(data, 'profiles', id)
        version = next(v for v in data['profile_versions'] if v['profile_id'] == id and v['version'] == row['current_version'])
        return dict(**row, phases=version['phases'])


@router.get('/profiles/{id}/versions')
def versions(id: str, request: Request, identity=Depends(current)):
    with request.app.state.repository.catalog(identity.company['id']) as data:
        find(data, 'profiles', id)
        return sorted([v for v in data['profile_versions'] if v['profile_id'] == id], key=lambda v: v['version'])


@router.post('/profiles/{id}/versions', status_code=201)
def create_version(id: str, request: Request, body: VersionInput | None = Body(default=None), identity=Depends(supervisor)):
    with request.app.state.repository.catalog(identity.company['id'], True) as data:
        row = find(data, 'profiles', id)
        current_version = next(v for v in data['profile_versions'] if v['profile_id'] == id and v['version'] == row['current_version'])
        phases = [p.model_dump() for p in body.phases] if body and body.phases else current_version['phases']
        row['current_version'] += 1
        return append_version(data, row, phases, identity.user['id'])


@router.get('/profiles/{id}/versions/{version_id}')
def version(id: str, version_id: str, request: Request, identity=Depends(current)):
    with request.app.state.repository.catalog(identity.company['id']) as data:
        find(data, 'profiles', id)
        row = find(data, 'profile_versions', version_id)
        if row['profile_id'] != id:
            fail(404, 'not_found', 'Resource not found')
        return row


@router.patch('/profiles/{id}/versions/{version_id}')
def immutable(id: str, version_id: str, request: Request, identity=Depends(supervisor)):
    version(id, version_id, request, identity)
    fail(422, 'immutable_version', 'Profile versions are read-only; create a new version')


@router.get('/calibrations')
def calibrations(request: Request, machine_id: str | None = None, profile_id: str | None = None, identity=Depends(current)):
    with request.app.state.repository.catalog(identity.company['id']) as data:
        return [c for c in data['calibrations'] if (not machine_id or c['machine_id'] == machine_id) and (not profile_id or c['profile_id'] == profile_id)]


@router.post('/calibrations')
def calibrate(body: CalibrationInput, request: Request, response: Response, identity=Depends(supervisor)):
    with request.app.state.repository.catalog(identity.company['id'], True) as data:
        machine = find(data, 'machines', body.machine_id)
        profile = find(data, 'profiles', body.profile_id)
        ver = find(data, 'profile_versions', body.profile_version_id)
        if ver['profile_id'] != body.profile_id or machine['profile_id'] != body.profile_id or machine['kind'] != profile['machine_kind']:
            fail(422, 'validation_error', 'Calibration must reference the installed profile and its version')
        row = next((c for c in data['calibrations'] if c['machine_id'] == body.machine_id and c['profile_id'] == body.profile_id), None)
        if row is None:
            row = dict(id=str(uuid4()), version=0)
            data['calibrations'].append(row)
            response.status_code = 201
        if body.state == 'calibrated' and (row.get('state') != 'calibrated' or row.get('profile_version_id') != body.profile_version_id):
            row['version'] += 1
        row.update(body.model_dump(), updated_at=now())
        return row


def save_link(data, body, id=None):
    row = find(data, 'sensing_links', id) if id else dict(id=str(uuid4()))
    row.update(body.model_dump())
    validate_link(data, row)
    if id is None:
        data['sensing_links'].append(row)
    sync_links(data)
    return row


@router.post('/sensing-links', status_code=201)
def create_link(body: LinkInput, request: Request, identity=Depends(supervisor)):
    with request.app.state.repository.catalog(identity.company['id'], True) as data:
        return save_link(data, body)


@router.put('/sensing-links/{id}')
def replace_link(id: str, body: LinkInput, request: Request, identity=Depends(supervisor)):
    with request.app.state.repository.catalog(identity.company['id'], True) as data:
        return save_link(data, body, id)


@router.delete('/sensing-links/{id}', status_code=204)
def delete_link(id: str, request: Request, identity=Depends(supervisor)):
    with request.app.state.repository.catalog(identity.company['id'], True) as data:
        data['sensing_links'].remove(find(data, 'sensing_links', id))
        sync_links(data)
    return Response(status_code=204)
