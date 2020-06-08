import { select, selectAll, event } from 'd3-selection';
import { polygonArea } from 'd3-polygon';
import { pointInPoly, adjustForEntropy, will_I_Collide, resetCollisions, detectCollisions, chooseDestination, adjustDestination, chooseGoal } from './utils';

/*
PIXELS_PER_FEET is the UNTRANSFORMED conversion, using the coordinates in the box we've selected to visualize ( x: 278 to 330, y: 476.5 to 528.5 )
This is transformed onto a 600px by 600px window, for a scaling factor of ~11.5 and a large offset
*/

let AGENT_COUNT = 0;
let agents = [];

let ROUTE_PATHS = {
	south_to_south: "M265,525.5072592838183L265.46609507268295,523.6587526942603L266.17844142671674,519.2370845430996L266.27712701028213,511.9954422295559L286.2147556464188,512.1394738887902L288.3873941167258,512.3039398649707h6",
	north_to_south: "M266.05130995390937,496.6290874448605L266.16266066767275,506.9172957118135L266.27712701028213,511.9954422295559L286.2147556464188,512.1394738887902L288.3873941167258,512.3039398649707h6",
	north_to_north: "M266.05130995390937,496.6290874448605L265.78092800360173,483.463482306106L265.68217458901927,477.9150904547423L265.68217458901927,477.9150904547423L287.3199564930983,477.9617389885243L288.65014250110835,477.9400098135229h3",
};

let SPACE_BOUNDS = {};
let SPACES = {};

let Agent = function(world, properties) {
	let self = this;

	const defaults = {
		world: world,
		index: AGENT_COUNT,
		node: null,
		x: 0,
		y: 0,
		radius: 6,
		velocity: 20, // feet per frame ATM
		space: null,
		goal: null,
		progress: 0,
		waiting: false,
		stationary: false,
		status: "none",
		destination: null,
		goal: "beach",
		success: false,
		collisions: []
	};	

	Object.assign(this, defaults);
	Object.assign(this, properties);

	this.placeMe = function() {
		return self.space.place(self);
	}

	this.moveMe = function() {
		if (self.waiting || self.stationary) {
			return;
		}

		self.space.advance(self);
		// self.world.identifyCollisions();
	}

	this.recomputeLocation = function() {
		if (self.status != "onBeach" && SPACES.beach.pointIsInside(self)) {
			self.status = "onBeach";
			self.space = SPACES.beach;
			if (self.goal == "walking") {
				chooseDestination(self, SPACES.beach, Math.pow(Math.random(), 2) * 0.8 + 0.1);
			} else if (self.goal == "tanning") {
				chooseDestination(self, SPACES.beach, Math.pow(Math.random(), 1 / 4)); // prefer closer to water
			} else if (self.goal == "swimming") {
				chooseDestination(self, SPACES.water, 0.2 + Math.random() / 4);				
			}
		} else if (self.status != "inWater" && SPACES.water.pointIsInside(self)) {			
			self.status = "inWater";
			self.space = SPACES.water;
			self.velocity = 2;
		}
	}
}

let Route = function(id, g, path, PIXELS_PER_FEET, scalingFactor, startingPosition) {
	let self = this;

	this.id = id;
	this.parent = g;
	this.element = g.append("path").attr("d", path).attr("id", "route_" + id).node();
	this.length = this.element.getTotalLength();
	this.lengthFeet = this.length / PIXELS_PER_FEET;
	this.startingPosition = startingPosition;

	select(this.element).style("stroke", randomColor()).style("fill", "none").style("stroke-width", 0 * PIXELS_PER_FEET);

	let place = this.place = function(agent, depth) {
		if (typeof depth === "undefined") {
			depth = 0;
		}

		agent.progress = self.startingPosition + (0.8 - self.startingPosition) * Math.random()

		// proposed position
		let point = self.element.getPointAtLength(self.length * agent.progress);
		point.radius = agent.radius;
		point.index = agent.index;

		let competitors = agents.filter(d => d.status == "movingTowardBeach");

		let willCollide = will_I_Collide(competitors, point, scalingFactor);

		if (!willCollide.collision) {
			agent.x = point.x;
			agent.y = point.y;
			return true;
		} else {
			if (depth > 2) {
				// console.log("Wasn't room to place an agent at beginning of route", id + ": ", agent);
				return false;				
			}
			return place(agent, depth + 1);
		}
	}

	let advance = this.advance = function(agent, depth) {
		let step = agent.velocity / self.lengthFeet; 
		let progressStep = adjustForEntropy(step);

		if (!depth) {
			// console.log("agent", agent.index, "starts at", agent.x, agent.y);
			depth = 0;
		}

		// adjust progress step based on level of recursion
		progressStep = progressStep * (depth + 1);

		// if (agent.collisions.length) {
		// 	progressStep = progressStep * (depth + 1);
		// } else {
		// 	progressStep = progressStep / Math.pow(2, depth);
		// }

		let nextProgress = agent.progress + progressStep;

		// console.log("nextProgress:", nextProgress);

		let point = self.element.getPointAtLength(self.length * nextProgress);
		point.radius = agent.radius;
		point.index = agent.index;

		// let distanceTraveled = Math.sqrt(Math.pow(agent.x - point.x, 2) + Math.pow(agent.y - point.y, 2));
		// console.log("Hoping", agent.index, "can travel", distanceTraveled, "to", point.x, point.y, agent);

		let willCollide = will_I_Collide(agents, point, scalingFactor);

		if (!willCollide.collision) {
			agent.x = point.x;
			agent.y = point.y;
			agent.progress = nextProgress;
			return true;
		} else {
			if (depth >= 2) {
				// if after 3 tries no luck, don't add yet
				return false;				
			}
			return advance(agent, depth + 1);
		}		
	}
}

let Space = function(id, element, PIXELS_PER_FEET) {
	let self = this;

	this.id = id;
	this.element = element;
	this.bbox = this.element.getBBox();
	this.bbox.mid_x = this.bbox.x + this.bbox.width / 2;
	this.bbox.mid_y = this.bbox.y + this.bbox.height / 2;

	this.bounds = SPACE_BOUNDS[id] = select(this.element).attr("d").match(/([0-9\.]+),([0-9\.]+)/g).map(d => d.split(",").map(j => +j));
	this.area = Math.abs(polygonArea(this.bounds));

	// 190,236 sq ft, 4.37 acres
	console.log("Area", this.area / (PIXELS_PER_FEET * PIXELS_PER_FEET));

	this.pointIsInside = function(point) {
		let onBeach = pointInPoly([ point.x, point.y ], SPACE_BOUNDS.beach);

		if (id === "water") {
			return !onBeach && pointInPoly([ point.x, point.y ], self.bounds);
		} else {
			return onBeach;
		}
	}

	let advance = this.advance = function(agent, competitors, depth) {

		if (typeof competitors == "undefined") {
			competitors = agents.filter(d => d.status == agent.status);
		}

		if (typeof depth == "undefined") {
			depth = 0;
		}

		if (!agent.destination) {
			console.log("No destination for", agent.index, agent);
			return;
		}

		if (agent.stationary) {
			if (agent.collisions.length > 0 && agent.radius == 6) {
				console.log("Moving STATIONARY agent", agent);
				adjustDestination(agent);
			} else {
				return;
			}
		}

		if (depth > 5) {
			// console.log("Ran out of tries to not collide:", agent);
			// console.log("Destination was", agent.destination.x, agent.destination.y);
			// agent.x += dx * stepSize;
			// agent.y += dy * stepSize;
			adjustDestination(agent);
			// console.log("New destination is", agent.destination.x, agent.destination.y);
			return false;
		}		

		// check if someone took our destination spot
		let spotTaken = will_I_Collide(agent.world.stationaries, agent.destination, agent.world.scalingFactor);

		if (spotTaken.collision) {
			// console.log("Whoops, our destination is now occupied. Adjusting");
			adjustDestination(agent);
		}

		let dx = agent.destination.x - agent.x;
		let dy = agent.destination.y - agent.y;
		let distance = Math.sqrt(dx * dx + dy * dy);
		let distanceFeet = distance / PIXELS_PER_FEET;
		// let theta = Math.atan(dy / dx);

		// if reached destination
		if (distanceFeet < 0.5) {
			if (agent.goal == "tanning") {
				agent.stationary = true;
				return;
			} else if (agent.goal == "walking") {
				// console.log("agent", agent.index, "finished her walking route and is choosing a new one");
				adjustDestination(agent);

				dx = agent.destination.x - agent.x;
				dy = agent.destination.y - agent.y;
				distance = Math.sqrt(dx * dx + dy * dy);
				distanceFeet = distance / PIXELS_PER_FEET;
				// theta = Math.atan(dy / dx);
			} else if (agent.goal == "swimming") {
				// console.log("agent", agent.index, "finished her swimming route and is choosing a new one");
				adjustDestination(agent);				

				dx = agent.destination.x - agent.x;
				dy = agent.destination.y - agent.y;
				distance = Math.sqrt(dx * dx + dy * dy);
				distanceFeet = distance / PIXELS_PER_FEET;
				// theta = Math.atan(dy / dx);
			}
		}

		// console.log("agent", agent.index, "is", distance, "pixels and", distanceFeet, "feet away from destination (" + dx + "," + dy + ")");

		// let stepSize = Math.min(1, adjustForEntropy(agent.velocity, 0.25 + depth * 0.1) / distanceFeet);
		let stepSize = Math.min(1, agent.velocity * (1 - depth * 0.1) / distanceFeet);

		let mx = adjustForEntropy(dx * stepSize);
		let my = adjustForEntropy(dy * stepSize);

		// theta = adjustForEntropy(theta, depth * 0.2);
		// dx = Math.cos(theta) * distance;
		// dy = Math.sin(theta) * distance;

		agent.progress = {
			d: distanceFeet,
			s: stepSize,
			dx: dx,
			dy: dy,
			mx: mx,
			my: my
			// dx1: Math.cos(theta) * distance,
			// dy1: Math.sin(theta) * distance
		};

		let point = {
			x: agent.x + mx,
			y: agent.y + my,
			radius: agent.radius,
			index: agent.index,
			status: agent.status,
			s: stepSize		
		}

		// console.log("Seeing if agent", agent.index, "collides with", competitors.length, "other agents at depth", depth);

		let willCollide = will_I_Collide(competitors, point, agent.world.scalingFactor);

		if (!willCollide.collision) {
			// if (depth > 0) {
				// console.log("Agent", agent.index, "finally found a legal spot at depth", depth, "at", point.x, point.y);
				//will_I_Collide(agents, point, agent.world.scalingFactor, true);
			// }

			agent.x = point.x;
			agent.y = point.y;
			return true;				
		} else {
			// if agent is extremely close to destination, adjust her destination
			if (stepSize > 0.98) {
				adjustDestination(agent);
			}
			return advance(agent, willCollide.competitors, depth + 1);
		}
	}
}

function setRadius(agent, t) {
	if (Math.random() < t) {
		agent.radius = 6;
	} else {
		agent.radius = 5 - Math.floor(Math.random() * 3);
		// console.log("subpar tolerance", agent.radius);
	}
}


function Beach(g, PIXELS_PER_FEET, scalingFactor) {
	let self = this;

	this.g = g;
	this.agents = agents;

	this.tolerance = 0.75;

	this.setTolerance = function(t) {
		self.tolerance = t;
		this.agents.forEach(agent => {
			setRadius(agent, self.tolerance);
		});
	}

	this.PIXELS_PER_FEET = PIXELS_PER_FEET;
	this.scalingFactor = scalingFactor;

	this.spaces = {};

	resetCollisions();

	let ACCESS_ROUTES = {};

	// ACCESS_ROUTES["south_to_south"] = new Route("south_to_south", g.features, ROUTE_PATHS.south_to_south, PIXELS_PER_FEET, scalingFactor)
	ACCESS_ROUTES["north_to_south"] = new Route("north_to_south", g.features, ROUTE_PATHS.north_to_south, PIXELS_PER_FEET, scalingFactor, 0.55)
	ACCESS_ROUTES["north_to_north"] = new Route("north_to_north", g.features, ROUTE_PATHS.north_to_north, PIXELS_PER_FEET, scalingFactor, 0.64)

	// AGENT-BASED MODELING
	let beach = this.spaces.beach = SPACES["beach"] = new Space("beach", select("#feature_id_175936656").node(), PIXELS_PER_FEET);	
	let water = this.spaces.water = SPACES["water"] = new Space("water", select("#coastline").node(), PIXELS_PER_FEET);	

	this.isOnTheBeach = function(point) {
		console.log(point);
		console.log(pointInPoly(point, beach.bounds));
	}

	this.addAgent = function() {
		// alernate spaces
		let space = Object.values(ACCESS_ROUTES)[AGENT_COUNT % Object.values(ACCESS_ROUTES).length];

		let a = new Agent(self, { 
			status: "movingTowardBeach",
			space: space,
			goal: chooseGoal()
		});

		setRadius(a, a.world.tolerance)

		let wasPlaced = a.placeMe();

		if (wasPlaced) {
			// console.log("successfully placed", a);
			agents.push(a);
			AGENT_COUNT += 1;
			return a;
		} else {
			return null;
		}
	}

	// people who are not moving
	this.stationaries = [];

	this.identifyCollisions = function() {
		self.stationaries = self.agents.filter(d => d.stationary);
		return detectCollisions(self.agents, scalingFactor);
	}

	let drawAgents = this.drawAgents = function(DRAW_ROUTES) {
		g.simulation.selectAll(".agent")
			.data(agents)
			.join("circle")
			.attr("id", d => "agent_" + d.index)
			.attr("cx", d => d.x)
			.attr("cy", d => d.y)
			.attr("r", function(d) {
				d.node = this;
				return (3 * PIXELS_PER_FEET);
			})
			.attr("class", "agent")
			// .style("stroke", d => d.status == "onBeach" ? "orange" : "blue")			
			.style("stroke", "#606060")			
			.style("stroke-width", 1 * PIXELS_PER_FEET)
			.style("stroke-dasharray", 1 * PIXELS_PER_FEET)
			.style("fill", d => {
				if (d.collisions.length > 0) {
					return "red";
					if (d.waiting && d.status != "onBeach") {
						return "pink";
					} else {
						return "pink";
					}
				}

				if (d.status == "onBeach") {
					return `rgba(255,146,58,${ d.stationary ? 1 : 0.50 })`;
					// return `rgba(255,146,58,0.50)`;
				}

				if (d.status == "inWater") {
					return "rgba(0,0,255,0.5)";
				}

				return "rgba(45,204,41,0.5)";
			})
			.on("click", function(d) {
				console.log(d);
			});

		let DESTINATION_COLORS = {
			tanning: "brown",
			walking: "green",
			swimming: "yellow"
		}

		if (DRAW_ROUTES) {
			let haveDestinations = agents.filter(d => d.destination && !d.stationary);

			g.simulation.selectAll(".destination_route").remove();
			g.simulation.selectAll(".destination_route")
				.data(haveDestinations)
				.join("path")
				.attr("d", function(d) {
					return `M${ d.x},${ d.y }L${ d.destination.x }, ${ d.destination.y }`;
				})
				.attr("class", "destination_route")
				.style("stroke-width", 1 / scalingFactor)
				.style("stroke", "rgba(0,0,0,0.1)")
				.style("fill", "none");

			g.simulation.selectAll(".destination").remove();
			g.simulation.selectAll(".destination")
				.data(haveDestinations)
				.join("circle")
				.attr("cx", d => d.destination.x)
				.attr("cy", d => d.destination.y)
				.attr("r", 2 / scalingFactor)
				.attr("class", "destination")
				.style("fill", d => DESTINATION_COLORS[d.goal]);
		}
	}

	this.recomputeLocations = function() {
		self.agents.forEach(agent => {
			agent.recomputeLocation();
		});
	}

	this.resetModel = function() {
		console.log("Clearing agents");
		agents = [];
		self.agents = [];
		g.simulation.selectAll(".agent").remove();
		AGENT_COUNT = 0;
	}
}

const randomColor = () => {
	return Math.floor(Math.random()*16777215).toString(16);
}

export { Beach }
