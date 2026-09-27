"""TECH-FACTS.md: regenerating it keeps the Snowflake section that analytics/scripts/report.py wrote."""

from scripts.tech_facts import with_snowflake

GENERATED = "# Tech facts\n\n## Validation\n\n- 5 events.\n\n## Tests\n\n- Engine: 86 passed.\n"
SECTION = "<!-- snowflake:start -->\n## Snowflake\n\n- Dedupe cross-check: all match.\n\n<!-- snowflake:end -->\n"


def test_the_snowflake_section_is_carried_over_before_tests():
    previous = f"# Tech facts\n\n## Validation\n\n- old.\n\n{SECTION}\n## Tests\n\n- Engine: 85 passed.\n"
    assert with_snowflake(GENERATED, previous) == (
        f"# Tech facts\n\n## Validation\n\n- 5 events.\n\n{SECTION}\n## Tests\n\n- Engine: 86 passed.\n"
    )


def test_windows_line_endings_in_the_previous_file():
    previous = f"# Tech facts\n\n{SECTION}\n## Tests\n".replace("\n", "\r\n")
    assert SECTION in with_snowflake(GENERATED, previous)


def test_no_snowflake_section_yet_leaves_the_file_as_generated():
    assert with_snowflake(GENERATED, "# Tech facts\n\n## Tests\n") == GENERATED
    assert with_snowflake(GENERATED, "") == GENERATED
