"""Phone-number input handling in the passenger search.

Operators read a number off the screen — where it is shown grouped as
"+998 93 577 04 88" — and type it with the spaces. The database stores it
unbroken, so those spaces used to mean "Mijoz topilmadi" for a client who was
right there.
"""
from __future__ import annotations

import pytest

from app.services.admin import phone_search_digits


@pytest.mark.parametrize(
    "typed",
    [
        "93 5770488",          # as reported
        "+998 93 577 04 88",   # copied from the panel's own formatting
        "998935770488",
        "+998935770488",
        "93-577-04-88",
        " 935770488 ",
        "(93) 577 04 88",
    ],
)
def test_however_an_operator_types_a_number_it_reduces_to_its_digits(typed):
    digits = phone_search_digits(typed)
    assert digits is not None
    # Every spelling must end up as a substring of the stored phone.
    assert digits in "+998935770488"


def test_a_name_is_left_alone():
    """Names must not be mangled into a phone search."""
    assert phone_search_digits("Shohonbek") is None
    assert phone_search_digits("Ali Valiyev") is None
    # A name with a digit in it is still a name, not a number.
    assert phone_search_digits("Ali 2") is None


def test_empty_and_separator_only_input_is_not_a_phone():
    assert phone_search_digits("") is None
    assert phone_search_digits("   ") is None
    assert phone_search_digits("+") is None
    assert phone_search_digits("- ()") is None


def test_a_partial_number_still_searches():
    """Operators often type only the last digits they remember."""
    assert phone_search_digits("577 04 88") == "5770488"
    assert phone_search_digits("93") == "93"
