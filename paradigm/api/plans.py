"""Endpoints for a project's plan (phases, milestones, the history of their dates) and the
plan templates kept on areas. A phase's or milestone's title and text are its note's
(/api/note/rename, /api/note/save).

GET  /api/plan                  -> {phases: [{id, start, end, baseline_start, baseline_end}],
                                    milestones: [{id, day, baseline_day, done_day}],
                                    changes: [{id, note_id, field, old, new, changed_at, reason}],
                                    applied: [{project_id, template_id, title, applied_at}]}
POST /api/phase/create          {project_id, title, start, end}       -> {note}
POST /api/phase/make            {id, start, end}  a plain note in a project becomes a phase -> {note}
POST /api/phase/unmake          {id}              back to a plain note                       -> {note}
POST /api/milestone/create      {owner_id, title, day}  (owner: a project or a phase)  -> {note}
POST /api/milestone/done        {id, done}                            -> milestone
POST /api/plan/dates            {id, start?, end?, day?, reason?}     -> {changes: [...]}
GET  /api/plan_templates        -> {templates: [{id, area_id, title, items: [{id, kind, title,
                                    start, end, phase_id, tasks: [{id, parent_id, title}]}]}]}
POST /api/plan_template/create  {area_id, title}                      -> template
POST /api/plan_template/rename  {id, title}                           -> template
POST /api/plan_template/remove  {id}                                  -> {}
POST /api/plan_template/item    {template_id, kind, title, start, end?, phase_id?} -> template
POST /api/plan_template/item/update {id, title?, start?, end?}        -> template
POST /api/plan_template/item/remove {id}                              -> template
POST /api/plan_template/task    {item_id, title, parent_id?}          -> template
POST /api/plan_template/task/remove {id}                              -> template
POST /api/plan_template/apply   {id, project_id, start}  -> {phases, milestones, tasks}: made
POST /api/plan_template/save    {project_id, title}                   -> template
"""
from http.server import BaseHTTPRequestHandler
from typing import Dict

from paradigm.api.answers import answering
from paradigm.db.notes_repo import NoteRepository, StaysInAHub, TitleTaken
from paradigm.db.plan_repo import BadTitle, BadWhen, HasMilestones, NotFound, NotInAProject, NotPlanned, PlanRepository
from paradigm.db.plan_templates_repo import BadPlan, NotAnArea, PlanTemplateRepository
from paradigm.db.tasks_repo import BadTask, NoTasksHere
from paradigm.web.requests import BadRequest, bool_field, int_field, optional_int_field, read_json
from paradigm.web.router import Router

_answer = answering({NotFound: 404, TitleTaken: 409, NotInAProject: 400, NotPlanned: 400, HasMilestones: 400,
                     NotAnArea: 400, BadPlan: 400, BadWhen: 400, BadTitle: 400, BadTask: 400, NoTasksHere: 400,
                     StaysInAHub: 400, BadRequest: 400})


class PlansApi:
    def __init__(self, plan: PlanRepository, templates: PlanTemplateRepository, notes: NoteRepository):
        self._plan = plan
        self._templates = templates
        self._notes = notes

    def register(self, router: Router) -> None:
        routes = [
            ("GET", "/api/plan", self.plan), ("POST", "/api/phase/create", self.create_phase),
            ("POST", "/api/phase/make", self.make_phase), ("POST", "/api/phase/unmake", self.unmake_phase),
            ("POST", "/api/milestone/create", self.create_milestone), ("POST", "/api/milestone/done", self.done),
            ("POST", "/api/plan/dates", self.dates),
            ("GET", "/api/plan_templates", self.templates), ("POST", "/api/plan_template/create", self.create_template),
            ("POST", "/api/plan_template/rename", self.rename_template),
            ("POST", "/api/plan_template/remove", self.remove_template),
            ("POST", "/api/plan_template/item", self.add_item), ("POST", "/api/plan_template/item/update", self.update_item),
            ("POST", "/api/plan_template/item/remove", self.remove_item),
            ("POST", "/api/plan_template/task", self.add_task), ("POST", "/api/plan_template/task/remove", self.remove_task),
            ("POST", "/api/plan_template/apply", self.apply), ("POST", "/api/plan_template/save", self.save),
        ]
        for method, path, handler in routes:
            router.add(method, path, _answer(handler))

    def plan(self, req: BaseHTTPRequestHandler) -> Dict:
        return dict(self._plan.plan(), applied=self._templates.applied())

    def create_phase(self, req: BaseHTTPRequestHandler) -> Dict:
        p = read_json(req)
        note_id = self._plan.create_phase(int_field(p, "project_id"), p.get("title"), p.get("start"), p.get("end"))
        return {"note": self._notes.get(note_id)}

    def make_phase(self, req: BaseHTTPRequestHandler) -> Dict:
        p = read_json(req)
        self._plan.make_phase(int_field(p, "id"), p.get("start"), p.get("end"))
        return {"note": self._notes.get(int_field(p, "id"))}

    def unmake_phase(self, req: BaseHTTPRequestHandler) -> Dict:
        note_id = int_field(read_json(req), "id")
        self._plan.unmake_phase(note_id)
        return {"note": self._notes.get(note_id)}

    def create_milestone(self, req: BaseHTTPRequestHandler) -> Dict:
        p = read_json(req)
        note_id = self._plan.create_milestone(int_field(p, "owner_id"), p.get("title"), p.get("day"))
        return {"note": self._notes.get(note_id)}

    def done(self, req: BaseHTTPRequestHandler) -> Dict:
        p = read_json(req)
        return self._plan.set_milestone_done(int_field(p, "id"), bool_field(p, "done"))

    def dates(self, req: BaseHTTPRequestHandler) -> Dict:
        p = read_json(req)
        values = {key: p[key] for key in ("start", "end", "day") if key in p}
        return {"changes": self._plan.set_dates(int_field(p, "id"), values, p.get("reason", ""))}

    def templates(self, req: BaseHTTPRequestHandler) -> Dict:
        return {"templates": self._templates.list()}

    def create_template(self, req: BaseHTTPRequestHandler) -> Dict:
        p = read_json(req)
        return self._templates.create(int_field(p, "area_id"), p.get("title"))

    def rename_template(self, req: BaseHTTPRequestHandler) -> Dict:
        p = read_json(req)
        return self._templates.rename(int_field(p, "id"), p.get("title"))

    def remove_template(self, req: BaseHTTPRequestHandler) -> Dict:
        self._templates.remove(int_field(read_json(req), "id"))
        return {}

    def add_item(self, req: BaseHTTPRequestHandler) -> Dict:
        p = read_json(req)
        return self._templates.add_item(int_field(p, "template_id"), p.get("kind"), p.get("title"), p.get("start"),
                                        p.get("end"), optional_int_field(p, "phase_id"))

    def update_item(self, req: BaseHTTPRequestHandler) -> Dict:
        p = read_json(req)
        return self._templates.update_item(int_field(p, "id"), {k: p[k] for k in ("title", "start", "end") if k in p})

    def remove_item(self, req: BaseHTTPRequestHandler) -> Dict:
        return self._templates.remove_item(int_field(read_json(req), "id"))

    def add_task(self, req: BaseHTTPRequestHandler) -> Dict:
        p = read_json(req)
        return self._templates.add_task(int_field(p, "item_id"), p.get("title"), optional_int_field(p, "parent_id"))

    def remove_task(self, req: BaseHTTPRequestHandler) -> Dict:
        return self._templates.remove_task(int_field(read_json(req), "id"))

    def apply(self, req: BaseHTTPRequestHandler) -> Dict:
        p = read_json(req)
        return self._templates.apply(int_field(p, "id"), int_field(p, "project_id"), p.get("start"))

    def save(self, req: BaseHTTPRequestHandler) -> Dict:
        p = read_json(req)
        return self._templates.save_from(int_field(p, "project_id"), p.get("title"))
