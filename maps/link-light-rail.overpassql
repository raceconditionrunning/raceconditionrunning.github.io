[out:json][timeout:25];
// Central puget sound, filter out airport light rail. Doesn't include T-Link tramway for now
(
  way["railway"="light_rail"]["service"!="yard"]["operator"!="Seattle-Tacoma International Airport"](47.213971,-122.640381,48.092757,-122.052612);
  way["railway"="construction"]["construction"="light_rail"]["service"!="yard"](47.213971,-122.640381,48.092757,-122.052612);
);

// Expand to get the corresponding ways (tracks)
out body;
>;
out skel qt;