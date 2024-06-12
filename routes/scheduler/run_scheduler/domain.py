import math
from functools import cache

from clorm import Predicate, IntegerField, StringField, \
    ContextBuilder


def kPrecision(val, precision):
    return math.ceil(val * 10 ** float(precision))


def make_standard_func_ctx():
    cb = ContextBuilder()

    cb.register_name("min", IntegerField, IntegerField, IntegerField, min)
    cb.register_name("max", IntegerField, IntegerField, IntegerField, max)
    cb.register_name("k", IntegerField, StringField, IntegerField, kPrecision)

    return cb.make_context()


class Exchange(Predicate):
    exchange_id = StringField
    name = StringField


class Route(Predicate):
    route_id = StringField
    name = StringField
    start_exchange = StringField
    end_exchange = StringField


class Day(Predicate):
    index = IntegerField


class DaySlot(Predicate):
    slot = IntegerField


class SlotAssignment(Predicate):
    day = IntegerField
    slot = IntegerField
    route_id = StringField


@cache
def IntegerFieldK(precision=2.0):
    class IntegerFieldK(IntegerField):
        # Represents a number to a fixed precision, 2 decimal places by default. We want
        # conservative approximations, so always round up
        pytocl = lambda val: math.ceil(val * 10 ** precision)
        cltopy = lambda val: val / 10 ** precision

    return IntegerFieldK


@cache
def DayDistRangeK(precision=2.0):
    class DayDistRange(Predicate):
        day = IntegerField
        lower = IntegerFieldK(precision=precision)
        upper = IntegerFieldK(precision=precision)

    return DayDistRange


@cache
def RouteDistanceK(precision=2.0):
    class RouteDistance(Predicate):
        route_id = StringField
        dist = IntegerFieldK(precision=precision)

    return RouteDistance


@cache
def RoutePairDistanceK(precision=2.0):
    class RoutePairDistance(Predicate):
        route_a = StringField
        route_b = StringField
        dist = IntegerFieldK(precision=precision)

    return RoutePairDistance


@cache
def ExchangePairDistanceK(precision=2.0):
    class ExchangePairDistance(Predicate):
        exchange_a = StringField
        exchange_b = StringField
        dist = IntegerFieldK(precision=precision)

    return ExchangePairDistance


@cache
def PreferredDistanceK(precision=2.0):
    class PreferredDistance(Predicate):
        name = StringField
        distance = IntegerFieldK(precision=precision)

    return PreferredDistance


class Ascent(Predicate):
    route_id = StringField
    ascent = IntegerField


class Descent(Predicate):
    route_id = StringField
    descent = IntegerField


class Run(Predicate):
    runner = StringField
    leg_id = IntegerField


class RouteAscent(Predicate):
    route_id = StringField
    ascent = IntegerField


class RouteDescent(Predicate):
    route_id = StringField
    descent = IntegerField


class RouteName(Predicate):
    route_id = StringField
    name = StringField


class Objective(Predicate):
    index = IntegerField
    name = StringField


class DistancePrecision(Predicate):
    precision = StringField


class DurationPrecision(Predicate):
    precision = StringField
