// xml-to-tools.js
const fs = require('fs');
const xml2js = require('xml2js');

async function convertXmlToJsonTools(xmlFilePath) {
  try {
    const xmlData = fs.readFileSync(xmlFilePath, 'utf-8');

    const parser = new xml2js.Parser({
      explicitArray: false, // To avoid arrays for single elements
      ignoreAttrs: false,
      tagNameProcessors: [xml2js.processors.stripPrefix] // To remove namespaces
    });

    const result = await parser.parseStringPromise(xmlData);
    let tasks = result.TaskerData.Task;
    if (!Array.isArray(tasks)) {
      tasks = [tasks];
    }
    
    const tools = [];

    for (const task of tasks) {
      const taskName = task.nme;
      // Only create tool definitions for tasks with a description (pc tag)
      if (!task.pc) {
        continue;
      }

      const toolDescription = {
        tasker_name: taskName,
        name: taskNameToToolName(taskName),
        description: generateDescription(task),
        inputSchema: extractInputSchema(task)
      };

      tools.push(toolDescription);
    }

    return JSON.stringify(tools, null, 2); // Pretty print JSON

  } catch (error) {
    console.error("Error processing XML:", error);
    return null;
  }
}

function taskNameToToolName(taskName) {
  // Lowercase, replace spaces with underscores, remove 'mcp_' prefix if present, and add 'tasker_' prefix.
  return taskName.toLowerCase()
                 .replace(/ /g, "_")
                 .replace(/^mcp_/, "tasker_")
                 .replace(/^mcp/, "tasker");
}

function generateDescription(task) {
  return task.pc ? task.pc : `Tasker Tool: ${task.nme}`;
}

function extractInputSchema(task) {
  const schema = { type: "object", properties: {} };
  const required = [];
  let profileVars = task.ProfileVariable;
  if (!profileVars) return schema;
  if (!Array.isArray(profileVars)) {
    profileVars = [profileVars];
  }
  profileVars.forEach(variable => {
    // Only consider ProfileVariables if:
    // - pvci is false
    // - immutable is true
    // - pvv (the current value) is empty or missing
    const pvci = variable.pvci;
    const immutable = variable.immutable;
    const pvv = variable.pvv;
    if ((pvci === "false" || pvci === false) &&
        (immutable === "true" || immutable === true) &&
        (!pvv || pvv.trim() === "")) {
      
      // Remove leading '%' from the variable name (pvn)
      let key = variable.pvn || "";
      if (key.startsWith("%")) {
        key = key.slice(1);
      }
      const desc = variable.pvd || "";
      
      // Infer type based on pvt value
      let type = "string";
      let enumVals;
      if (variable.pvt === "onoff") {
        type = "string";
        enumVals = ["on", "off"];
      } else if (variable.pvt === "n") {
        type = "number";
      } else {
        type = "string";
      }
      
      schema.properties[key] = { type: type };
      if (desc) {
        schema.properties[key].description = desc;
      }
      if (enumVals) {
        schema.properties[key].enum = enumVals;
      }
      
      // Use clearout as the 'required' flag:
      // if clearout is true, then the argument is required.
      if (variable.clearout === "true" || variable.clearout === true) {
        required.push(key);
      }
    }
  });
  if (required.length > 0) {
    schema.required = required;
  }
  return schema;
}

// --- Main execution ---
const xmlFilePath = process.argv[2]; // Get XML file path from command line argument

if (!xmlFilePath) {
  console.error("Usage: node xml-to-tools.js <path-to-tasker-xml-file>");
  process.exit(1);
}

convertXmlToJsonTools(xmlFilePath)
  .then(jsonOutput => {
    if (jsonOutput) {
      console.log(jsonOutput);
    } else {
      console.error("Failed to convert XML to JSON Tools.");
    }
  });
