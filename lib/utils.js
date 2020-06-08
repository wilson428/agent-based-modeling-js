let COLLISIONS = 0;

function getCollisionCount() {
	return COLLISIONS;
}


function moveToFront(obj) {
	let node = obj.node(); 
	node.parentNode.appendChild(node);
}

// from https://github.com/substack/point-in-polygon
function pointInPoly(point, vs) {
	// ray-casting algorithm based on
	// http://www.ecse.rpi.edu/Homepages/wrf/Research/Short_Notes/pnpoly.html
	let xi, xj, i, j, intersect;
	let x = point[0];
	let y = point[1];
	let inside = false;
	
	for (i = 0, j = vs.length - 1; i < vs.length; j = i++) {
		let xi = vs[i][0];
		let yi = vs[i][1];
		let xj = vs[j][0];
		let yj = vs[j][1];

		let intersect = ((yi > y) != (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
		if (intersect) inside = !inside;
	}
	return inside;
}

let ENTROPY = 0.25; // x * (1 - ENTROPY) + Math.random() * ENTROPY * 2

function adjustForEntropy(l, e) {
	if (typeof e == "undefined") {
		e = ENTROPY;
	}
	let h = ((1 - e) + Math.random() * e * 2);
	return l * h;
}

let MINIMUM_VIABILE_RADIUS = 50; // don't recheck any agents outside this radius

function will_I_Collide(agents, candidate, scalingFactor) {
	let competitors = [];

	for (let i = 0; i < agents.length; i += 1) {
		let agent = agents[i];

		if (candidate.hasOwnProperty("index") && agent.index === candidate.index) {
			continue;
		}

		let dx = Math.abs(candidate.x - agent.x) * scalingFactor;
		let dy = Math.abs(candidate.y - agent.y) * scalingFactor;
		let d = Math.sqrt(dx * dx + dy * dy);
		let dScaled = parseFloat(d.toFixed(2)); // the agents are all on the universal scale, including their radii

		if (dScaled < MINIMUM_VIABILE_RADIUS) {
			competitors.push(agent);
		}

		if (dScaled < candidate.radius) {
			if (candidate.hasOwnProperty("status")) {
				// console.log("Prospective new location for", candidate.index, "with step size of", candidate.s, "at", candidate.x, candidate.y, "is only", dx, dy, d, dScaled, "from", agent);
			}
			// g.simulation.append("circle").attr("cx", x).attr("cy", y).attr("r", 3 * PIXELS_PER_FEET).style("fill", "black").attr("class", "dummy");
			return {
				competitors: competitors,
				collision: true
			}
		}
	}
	return {
		competitors: null,
		collision: false
	}
}

function resetCollisions() {
	COLLISIONS = 0;
}

function detectCollisions(agents, scalingFactor) {
	let maxRadius = 0;
	let alpha = 1;

	agents.forEach(agent => {
		agent.collisions = [];
		agent.waiting = false;
	});

	for (let i = 0; i < agents.length; i += 1) {
		let agent = agents[i];
		if (!agent.node) {
			continue;
		}

		for (let j = i + 1; j < agents.length; j += 1) {
			let neighbor = agents[j];

			let dx = Math.abs(neighbor.x - agent.x) * scalingFactor;
			let dy = Math.abs(neighbor.y - agent.y) * scalingFactor;

			if (dx >= 6 || dy >= 6) {
				continue;
			}

			let d = Math.sqrt(dx * dx + dy * dy);
			let dScaled = parseFloat(d.toFixed(2));

			if (dScaled < 6) {
				COLLISIONS += 1;
				agent.collisions.push(neighbor);
				neighbor.collisions.push(agent);
				if (neighbor.status == "movingTowardBeach") {
					neighbor.waiting = true;
				}
				// console.log("collision between", agent.index, "and", neighbor.index, "of", dx, dy, d);
				// console.log(agent.x, agent.y, "vs", neighbor.x, neighbor.y);					
				// console.log(agent, neighbor);
			}
		}
	}
	return COLLISIONS;
}

// proximity is the desired extent into the space we wish to reach
function chooseDestination(agent, space, proximity, depth) {
	if (typeof depth == "undefined") {
		depth = 0;
	}

	if (depth > 5) {
		console.log("agent", agent.index, "couldn't find a destination.");
		agent.destination = { x: agent.x, y: agent.y };
		return false;
	}

	proximity = Math.max(0.05, Math.min(0.95, adjustForEntropy(proximity)));

	let x = space.bbox.x + space.bbox.width * proximity;

	// chose any spot on the shoreline
	let y = space.bbox.y + space.bbox.height * (0.05 + 0.9 * Math.pow(Math.random(), 1));

	if (!space.pointIsInside({ x: x, y: y })) {
		// console.log("Chosen destination of", x, y, "is out of bounds of space '" + space.id + "'. Retrying");
		return chooseDestination(agent, space, proximity, depth + 1);
	}

	let spotTaken = will_I_Collide(agent.world.stationaries, { x: x, y: y }, agent.world.scalingFactor);

	if (spotTaken.collision) {
		console.log("agent", agent.index, "can't head to", x, y, "because someone is parked there.");
		return chooseDestination(agent, space, proximity, depth + 1);		
	}

	agent.destination = { x: x, y: y };
	return true;				
}

function adjustDestination(agent, depth) {
	if (typeof depth == "undefined") {
		depth = 0;
	}

	let space = agent.space;
	let x = 0;
	let y = 0;

	if (depth > 5) {
		// console.log("agent", agent.index, "couldn't find a NEW destination.", agent);
		agent.destination = { x: agent.x, y: agent.y };
		return false;
	}

	if (agent.goal == "walking" || (agent.goal == "tanning" && agent.stationary == false)) {
		x = agent.destination.x + ( 0.3 * Math.random() - 0.15 ) * space.bbox.width;
		if (agent.destination.y < (space.bbox.mid_y)) {
			y = space.bbox.mid_y + 0.45 * Math.random() * space.bbox.height;
		} else {
			y = space.bbox.y + (0.05 + 0.45 * Math.random()) * space.bbox.height;
		}
	} else if (agent.goal == "swimming") {
		x = agent.destination.x + ( 0.2 * Math.random() - 0.1 ) * space.bbox.width;
		y = agent.destination.y + ( 0.3 * Math.random() - 0.15 ) * space.bbox.height;
	} else if (agent.goal == "tanning") {
		x = agent.destination.x + ( 0.05 * Math.random() - 0.025 ) * space.bbox.width;
		y = agent.destination.y + ( 0.05 * Math.random() - 0.025 ) * space.bbox.height;
	}

	// console.log("Proposed new destination:", x, y, "in space", space);

	if (!space.pointIsInside({ x: x, y: y })) {
		// console.log("Chosen NEW destination of", x, y, "is out of bounds of space '" + space.id + "'. Retrying");
		return adjustDestination(agent, depth + 1);
	}

	let spotTaken = will_I_Collide(agent.world.stationaries, { x: x, y: y }, agent.world.scalingFactor);

	if (spotTaken.collision) {
		console.log("agent", agent.index, "can't head to", x, y, "because someone is parked there.");
		return adjustDestination(agent, depth + 1);
	}

	agent.destination = { x: x, y: y };
	return true;			
}


const GOALS = [
	[ "swimming", 0.2 ],
	[ "tanning", 0.5 ],
	[ "walking", 1.0 ]
];

function chooseGoal() {
	let r = Math.random();
	for (let c = 0; c < GOALS.length; c += 1) {
		if (r <= GOALS[c][1]) {
			return GOALS[c][0];
		}
	}

	return null;
}


export { moveToFront, pointInPoly, adjustForEntropy, will_I_Collide, resetCollisions, detectCollisions, chooseDestination, adjustDestination, chooseGoal }