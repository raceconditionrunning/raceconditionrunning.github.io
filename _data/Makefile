ROUTES        = routes.yml
ROUTE_DB_CSV  = route-db.csv
ROUTE_DB_YML  = route-db.yml
LEGACY_ROUTES = legacy-routes.yml

routes.yml: $(ROUTE_DB_YML) $(LEGACY_ROUTES)
	cat $(ROUTE_DB_YML) > $(ROUTES)
	echo "" >> $(ROUTES)
	echo "# LEGACY ROUTES FROM $(LEGACY_ROUTES)" >> $(ROUTES)
	echo "" >> $(ROUTES)
	cat $(LEGACY_ROUTES) >> $(ROUTES)

$(ROUTE_DB_YML): $(ROUTE_DB_CSV)
	python3 route-db-invariants.py

.PHONY: clean
clean:
	rm -f $(ROUTES) $(ROUTE_DB_YML)
