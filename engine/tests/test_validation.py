"""VALIDATION.md: each saved answer in data/validation/answers/ is still the engine's answer (no network)."""

import json

import pytest

from scripts import validate

PLAN = validate.plan()


@pytest.mark.parametrize("case", validate.cases(PLAN), ids=lambda case: case["id"])
def test_the_saved_validation_answer_is_still_the_engines_answer(case):
    saved = json.loads((validate.ANSWERS / f"{case['id']}.json").read_text(encoding="utf-8"))

    assert validate.answer(case, PLAN) == saved
