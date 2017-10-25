"use strict";
/* Base class for measure sources to extend.  SubClasses will need to implement the getMeasureDef method to return the measure defintion to be used
  for generating executable measures.  Bundle is a measure source that loades definitions from measure bundles.  MongoSource is a measure source that
  loads the definitions from mongodb
  */
module.exports = class MeasureSource {

  constructor(){
    this.generated_measures = {};
  }

  /* Retrieve the measure definition for the given measrue id and sub id
  */
  getMeasureDef(measure_id, sub_id){
    throw "Implement me";
  }

  /*
  Retrieve the executable measure.
  @param
  @param
  @returns an instance object that can generate measures for execution.  Returned objects have a generate(options) method on them that will generate
  executable measures based on the options passed in such as effective_date and enable_logging;
  */
  getMeasure(measure_id, sub_id) {
    //short curcuit if we can
    var id = this.getMeasureAndSubId(measure_id, sub_id);
    var cache_id = `${id.id}_${id.sub_id}`
    if (this.generated_measures[cache_id]) {
      return this.generated_measures[cache_id];
    } else if (!this.getMeasureDef(id.id, id.sub_id)) {
      return;
    }
    // need to scope the context that these are evaluated in to prevent
    // clobbering other measures , used in eval below
    let context = {}
    var measure = this.getMeasureDef(id.id, id.sub_id)
    var cms_id = measure.sub_id ? `${measure.cms_id}${measure.sub_id}` : measure.cms_id
    var template = _.template(`(
      class ${cms_id} {
          constructor(){
            this.hqmf_id = "<%= hqmf_id %>";
            this.sub_id=<%= (sub_id) ? "'" + sub_id +"'": 'null' %>;
            this.cms_id=<%= (cms_id) ? "'" + cms_id +"'": 'null' %>;
            this.continuous_variable = <%= continuous_variable ? 'true' : 'false' %>;
            this.aggregator = <%= aggregator ? "'" + aggregator + "'" : 'null' %>;
            this.population_ids = <%= JSON.stringify(population_ids) %>;
            this.measure = <%= JSON.stringify(measure) %>
          }
          generate(options){
            var hqmfjs = {};
            <%= logic %>
            return hqmfjs;
          }
      }
    )`)

    let logic_template = _.template(measure.map_fn);
    let binding = {
      logic: logic_template({
        effective_date: "options.effective_date;",
        enable_logging: "options.enable_logging;",
        enable_rationale: "options.enable_rationale;",
        short_circuit: "options.short_circuit;"
      }),
      name: measure_id,
      hqmf_id: measure.hqmf_id,
      sub_id: measure.sub_id,
      continuous_variable: measure.continuous_variable,
      aggregator: measure.aggregator,
      population_ids: measure.population_ids,
      cms_id: measure.cms_id,
      measure: measure
    };

    var cl = eval(template(binding))

    this.generated_measures[cache_id] = new cl();
    return this.generated_measures[cache_id];
  }

  /* Utility method that will analyze the measure id and sub id for different formats. Measure id may be the CMS id in the format CMS#v# , the CMS id
   may also include the sub_id value CMS#v#sub_id for example CMS182v5a.  THe measure_id may also be the HQMF id which could also conditionally contain
   the sub_id separated by a colon.  Measure id may also be a json object {measure_id: "" , sub_id : ""} where measure_id is the CMS or HQMF ids sans sub_id
   and the sub_id would be the sub_id or null.  If the measure_id parameter is a string minus the sub_id then the sub_id parameter will be used otherwise it
   is ignored.
   */
  getMeasureAndSubId(measure_id, sub_id){
    // is measure id a hash?
    if(measure_id.id){
      return measure_id;
    }
    // is it a concatinated CMS##v#sub_id format?
    var res = /CMS\d*v\d*([a-z]*)?/.exec(measure_id);
    if(res){
      var strip = res[1] ? res[1].length : 0
      measure_id = measure_id.slice(0,measure_id.length - strip)
      if(sub_id == null && sub_id != res[1]){
        sub_id = res[1]
      }
      return {id: measure_id, sub_id: sub_id};
    }else{
      // is it an HQMF_ID:SUB_ID format
      var parts = measure_id.split(":")
      var ret = {}
      if(parts.length == 2){
        return {id: parts[0], sub_id: parts[1]};
      }else{
        return {id: measure_id, sub_id: sub_id};
      }
    }
  }
}
