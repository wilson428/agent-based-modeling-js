import { pointInPoly, adjustForEntropy, will_I_Collide, detectCollisions } from './utils';

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

	let x = space.bbox.x + space.bbox.width * adjustForEntropy(proximity);

	// chose any spot on the shoreline
	let y = space.bbox.y + space.bbox.height * (0.05 + 0.9 * Math.pow(Math.random(), 1));

	if (!space.pointIsInside({ x: x, y: y })) {
		console.log("Chosen destination of", x, y, "is out of bounds of space '" + space.id + "'. Retrying");
		return chooseDestination(agent, space, proximity, depth + 1);
	}

	let spotTaken = will_I_Collide(agent.world.stationaries, agent, agent.world.scalingFactor);

	if (spotTaken) {
		console.log("agent", agent.index, "can't head to", x, y, "because someone is parked there.");
		return chooseDestination(agent, space, proximity, depth + 1);		
	}

	agent.destination = { x: x, y: y };
	return true;				
}

let Goal = function(location, properties) {
	let destination = 


}