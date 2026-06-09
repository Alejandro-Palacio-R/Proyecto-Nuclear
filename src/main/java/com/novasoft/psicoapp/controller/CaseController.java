package com.novasoft.psicoapp.controller;

import com.novasoft.psicoapp.model.*;
import com.novasoft.psicoapp.repo.*;
import com.novasoft.psicoapp.service.CurrentUser;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import java.util.*;

@RestController
@RequestMapping("/api/cases")
public class CaseController {
  private final CaseRepo cases;
  private final ScenarioRepo scenarios;
  private final QuestionRepo questions;
  private final OptionRepo options;
  private final StudentAnswerRepo studentAnswers;
  private final AssignmentRepo assignments;
  private final GroupRepo groups;
  private final UserRepo users;
  private final CurrentUser current;

  public CaseController(CaseRepo c, ScenarioRepo s, QuestionRepo q, OptionRepo o, StudentAnswerRepo ar, AssignmentRepo a, GroupRepo g, UserRepo u, CurrentUser cu) {
    cases = c; scenarios = s; questions = q; options = o; studentAnswers = ar; assignments = a; groups = g; users = u; current = cu;
  }

  @GetMapping
  public List<CaseStudy> all() {
    return cases.findByActiveTrue();
  }

  @GetMapping("/students")
  @PreAuthorize("hasAnyRole('PROFESOR','ADMIN')")
  public List<Map<String, Object>> students() {
    return users.findByRole(Role.ESTUDIANTE).stream()
      .sorted(Comparator.comparing(u -> u.name == null ? "" : u.name))
      .map(this::studentDto)
      .toList();
  }

  @PostMapping
  @PreAuthorize("hasAnyRole('PROFESOR','ADMIN')")
  public CaseStudy create(@RequestBody CaseStudy c) {
    c.professor = current.get();
    return cases.save(c);
  }

  @PostMapping("/import")
  @PreAuthorize("hasAnyRole('PROFESOR','ADMIN')")
  public List<Map<String, Object>> importCases(@RequestBody Map<String, Object> body) {
    return persistImportedCases(importCaseBodies(body));
  }

  @PostMapping(value = "/import-text", consumes = "text/plain")
  @PreAuthorize("hasAnyRole('PROFESOR','ADMIN')")
  public List<Map<String, Object>> importCasesText(@RequestBody String body) {
    return persistImportedCases(parseNaturalImport(body));
  }

  private List<Map<String, Object>> persistImportedCases(List<Map<String, Object>> caseBodies) {
    List<Map<String, Object>> imported = new ArrayList<>();
    if (caseBodies.isEmpty()) throw new IllegalArgumentException("El formato no contiene casos para importar");

    for (Map<String, Object> caseBody : caseBodies) {
      CaseStudy c = new CaseStudy();
      c.title = requiredText(caseBody, "title");
      c.description = textValue(caseBody.get("description"), "");
      c.category = textValue(caseBody.get("category"), "");
      c.difficulty = textValue(caseBody.get("difficulty"), "Media");
      c.professor = current.get();
      c = cases.save(c);

      List<Map<String, Object>> blocks = mapList(caseBody.get("blocks"));
      int order = 1;
      for (Map<String, Object> block : blocks) {
        createImportedBlock(c, block, order++);
      }

      Map<String, Object> summary = new LinkedHashMap<>();
      summary.put("caseId", c.id);
      summary.put("title", c.title);
      summary.put("blocks", blocks.size());
      imported.add(summary);
    }
    return imported;
  }

  @PutMapping("/{id}")
  @PreAuthorize("hasAnyRole('PROFESOR','ADMIN')")
  public CaseStudy update(@PathVariable Long id, @RequestBody CaseStudy in) {
    CaseStudy c = cases.findById(id).orElseThrow();
    c.title = in.title; c.description = in.description; c.category = in.category; c.difficulty = in.difficulty;
    return cases.save(c);
  }

  @DeleteMapping("/{id}")
  @PreAuthorize("hasAnyRole('PROFESOR','ADMIN')")
  public void delete(@PathVariable Long id) {
    CaseStudy c = cases.findById(id).orElseThrow();
    c.active = false;
    cases.save(c);
  }

  @GetMapping("/{id}/blocks")
  public List<Map<String, Object>> blocks(@PathVariable Long id) {
    return scenarios.findByCaseStudyIdOrderByOrderIndexAsc(id).stream().map(this::blockDto).toList();
  }

  @PostMapping("/{id}/blocks")
  @PreAuthorize("hasAnyRole('PROFESOR','ADMIN')")
  public Map<String, Object> createBlock(@PathVariable Long id, @RequestBody Map<String, Object> body) {
    String type = String.valueOf(body.getOrDefault("blockType", "TEXT")).toUpperCase(Locale.ROOT);
    if (!type.equals("TEXT") && !type.equals("QUESTION")) throw new IllegalArgumentException("Tipo de bloque invalido");

    Scenario s = new Scenario();
    s.caseStudy = cases.findById(id).orElseThrow();
    s.blockType = type;
    s.orderIndex = intValue(body.get("orderIndex"), scenarios.findByCaseStudyId(id).size() + 1);
    s.title = String.valueOf(body.getOrDefault("title", type.equals("TEXT") ? "Texto" : "Pregunta"));
    s.contextText = String.valueOf(body.getOrDefault("contextText", ""));
    s = scenarios.save(s);

    if (type.equals("QUESTION")) {
      List<Map<String, Object>> optionBodies = optionBodies(body.get("options"));
      if (optionBodies.size() < 3 || optionBodies.size() > 4) throw new IllegalArgumentException("Cada pregunta debe tener entre 3 y 4 opciones");

      Question q = new Question();
      q.scenario = s;
      q.orderIndex = 1;
      q.score = intValue(body.get("score"), 10);
      q.text = String.valueOf(body.getOrDefault("questionText", s.title));
      q = questions.save(q);

      for (Map<String, Object> optionBody : optionBodies) {
        AnswerOption o = new AnswerOption();
        o.question = q;
        o.text = String.valueOf(optionBody.getOrDefault("text", ""));
        o.correct = Boolean.TRUE.equals(optionBody.get("correct"));
        o.justification = String.valueOf(optionBody.getOrDefault("justification", ""));
        options.save(o);
      }
    }

    return blockDto(s);
  }

  @PutMapping("/blocks/{id}")
  @PreAuthorize("hasAnyRole('PROFESOR','ADMIN')")
  public Map<String, Object> updateBlock(@PathVariable Long id, @RequestBody Map<String, Object> body) {
    Scenario s = scenarios.findById(id).orElseThrow();
    String type = textValue(body.getOrDefault("blockType", s.blockType), s.blockType).toUpperCase(Locale.ROOT);
    if (!type.equals("TEXT") && !type.equals("QUESTION")) throw new IllegalArgumentException("Tipo de bloque invalido");
    if (!type.equals(s.blockType)) throw new IllegalArgumentException("No se puede cambiar el tipo de bloque");

    s.title = textValue(body.get("title"), s.title);
    s.contextText = textValue(body.get("contextText"), s.contextText);
    s = scenarios.save(s);

    if (type.equals("QUESTION")) {
      List<Map<String, Object>> optionBodies = mapList(body.get("options"));
      if (!optionBodies.isEmpty()) {
        if (optionBodies.size() < 3 || optionBodies.size() > 4) throw new IllegalArgumentException("Cada pregunta debe tener entre 3 y 4 opciones");
        if (optionBodies.stream().noneMatch(o -> boolValue(o.get("correct")))) throw new IllegalArgumentException("Cada pregunta debe tener al menos una opcion correcta");
      }

      Question q = questions.findByScenarioIdOrderByOrderIndexAsc(s.id).stream().findFirst().orElseThrow();
      q.text = textValue(body.get("questionText"), q.text);
      q.score = intValue(body.get("score"), q.score);
      questions.save(q);

      if (!optionBodies.isEmpty()) {
        studentAnswers.deleteAll(studentAnswers.findByQuestionId(q.id));
        options.deleteAll(options.findByQuestionIdOrderByIdAsc(q.id));
        for (Map<String, Object> optionBody : optionBodies) {
          AnswerOption o = new AnswerOption();
          o.question = q;
          o.text = requiredText(optionBody, "text");
          o.correct = boolValue(optionBody.get("correct"));
          o.justification = textValue(optionBody.get("justification"), "");
          options.save(o);
        }
      }
    }
    return blockDto(s);
  }

  @DeleteMapping("/blocks/{id}")
  @PreAuthorize("hasAnyRole('PROFESOR','ADMIN')")
  public void deleteBlock(@PathVariable Long id) {
    Scenario s = scenarios.findById(id).orElseThrow();
    for (Question q : questions.findByScenarioIdOrderByOrderIndexAsc(s.id)) {
      studentAnswers.deleteAll(studentAnswers.findByQuestionId(q.id));
      options.deleteAll(options.findByQuestionIdOrderByIdAsc(q.id));
      questions.delete(q);
    }
    Long caseId = s.caseStudy.id;
    scenarios.delete(s);
    renumberBlocks(caseId);
  }

  @PostMapping("/blocks/{id}/move")
  @PreAuthorize("hasAnyRole('PROFESOR','ADMIN')")
  public List<Map<String, Object>> moveBlock(@PathVariable Long id, @RequestBody Map<String, Object> body) {
    Scenario s = scenarios.findById(id).orElseThrow();
    List<Scenario> blocks = scenarios.findByCaseStudyIdOrderByOrderIndexAsc(s.caseStudy.id);
    int index = -1;
    for (int i = 0; i < blocks.size(); i++) if (Objects.equals(blocks.get(i).id, id)) index = i;
    String direction = textValue(body.get("direction"), "").toUpperCase(Locale.ROOT);
    int target = direction.equals("UP") ? index - 1 : direction.equals("DOWN") ? index + 1 : -1;
    if (index < 0 || target < 0 || target >= blocks.size()) return blocks.stream().map(this::blockDto).toList();
    Scenario other = blocks.get(target);
    int currentOrder = s.orderIndex;
    s.orderIndex = other.orderIndex;
    other.orderIndex = currentOrder;
    scenarios.save(other);
    scenarios.save(s);
    return scenarios.findByCaseStudyIdOrderByOrderIndexAsc(s.caseStudy.id).stream().map(this::blockDto).toList();
  }

  private Scenario createImportedBlock(CaseStudy cs, Map<String, Object> body, int fallbackOrder) {
    String type = textValue(body.getOrDefault("blockType", body.getOrDefault("type", "TEXT")), "TEXT").toUpperCase(Locale.ROOT);
    if (!type.equals("TEXT") && !type.equals("QUESTION")) throw new IllegalArgumentException("Tipo de bloque invalido: " + type);

    Scenario s = new Scenario();
    s.caseStudy = cs;
    s.blockType = type;
    s.orderIndex = intValue(body.get("orderIndex"), fallbackOrder);
    s.title = textValue(body.get("title"), type.equals("TEXT") ? "Texto" : "Pregunta");
    s.contextText = textValue(body.getOrDefault("contextText", body.get("text")), "");
    s = scenarios.save(s);

    if (type.equals("QUESTION")) {
      List<Map<String, Object>> optionBodies = mapList(body.get("options"));
      if (optionBodies.size() < 3 || optionBodies.size() > 4) throw new IllegalArgumentException("Cada pregunta debe tener entre 3 y 4 opciones");
      if (optionBodies.stream().noneMatch(o -> boolValue(o.get("correct")))) throw new IllegalArgumentException("Cada pregunta debe tener al menos una opcion correcta");

      Question q = new Question();
      q.scenario = s;
      q.orderIndex = 1;
      q.score = intValue(body.get("score"), 10);
      q.text = textValue(body.getOrDefault("questionText", body.get("question")), s.title);
      if (q.text.isBlank()) throw new IllegalArgumentException("La pregunta no puede estar vacia");
      q = questions.save(q);

      for (Map<String, Object> optionBody : optionBodies) {
        AnswerOption o = new AnswerOption();
        o.question = q;
        o.text = requiredText(optionBody, "text");
        o.correct = boolValue(optionBody.get("correct"));
        o.justification = textValue(optionBody.get("justification"), "");
        options.save(o);
      }
    }
    return s;
  }

  @PostMapping("/{id}/scenarios")
  @PreAuthorize("hasAnyRole('PROFESOR','ADMIN')")
  public Scenario scenario(@PathVariable Long id, @RequestBody Scenario s) {
    s.caseStudy = cases.findById(id).orElseThrow();
    return scenarios.save(s);
  }

  @GetMapping("/{id}/scenarios")
  public List<Scenario> scenarios(@PathVariable Long id) {
    return scenarios.findByCaseStudyIdOrderByOrderIndexAsc(id);
  }

  @PostMapping("/scenarios/{id}/questions")
  @PreAuthorize("hasAnyRole('PROFESOR','ADMIN')")
  public Question question(@PathVariable Long id, @RequestBody Question q) {
    q.scenario = scenarios.findById(id).orElseThrow();
    return questions.save(q);
  }

  @GetMapping("/scenarios/{id}/questions")
  public List<Question> questions(@PathVariable Long id) {
    return questions.findByScenarioIdOrderByOrderIndexAsc(id);
  }

  @PostMapping("/questions/{id}/options")
  @PreAuthorize("hasAnyRole('PROFESOR','ADMIN')")
  public AnswerOption option(@PathVariable Long id, @RequestBody AnswerOption o) {
    o.question = questions.findById(id).orElseThrow();
    return options.save(o);
  }

  @GetMapping("/questions/{id}/options")
  public List<AnswerOption> options(@PathVariable Long id) {
    return options.findByQuestionIdOrderByIdAsc(id);
  }

  @PostMapping("/{id}/assign-group/{groupId}")
  @PreAuthorize("hasAnyRole('PROFESOR','ADMIN')")
  public List<Assignment> assignGroup(@PathVariable Long id, @PathVariable Long groupId) {
    CaseStudy cs = cases.findById(id).orElseThrow();
    StudyGroup g = groups.findById(groupId).orElseThrow();
    List<Assignment> out = new ArrayList<>();
    for (User s : g.students) {
      Assignment a = new Assignment();
      a.caseStudy = cs; a.group = g; a.student = s;
      out.add(assignments.save(a));
    }
    return out;
  }

  @PostMapping("/{id}/assign-students")
  @PreAuthorize("hasAnyRole('PROFESOR','ADMIN')")
  public List<Map<String, Object>> assignStudents(@PathVariable Long id, @RequestBody Map<String, List<Long>> body) {
    CaseStudy cs = cases.findById(id).orElseThrow();
    List<Map<String, Object>> out = new ArrayList<>();
    for (Long studentId : body.getOrDefault("studentIds", List.of())) {
      User student = users.findById(studentId).orElseThrow();
      if (student.role != Role.ESTUDIANTE) throw new IllegalArgumentException("El usuario " + studentId + " no es estudiante");
      Assignment a = new Assignment();
      a.caseStudy = cs; a.student = student;
      Assignment saved = assignments.save(a);
      Map<String, Object> m = studentDto(student);
      m.put("assignmentId", saved.id);
      out.add(m);
    }
    return out;
  }

  @PostMapping("/{id}/assign-student/{studentId}")
  @PreAuthorize("hasAnyRole('PROFESOR','ADMIN')")
  public Assignment assignStudent(@PathVariable Long id, @PathVariable Long studentId) {
    Assignment a = new Assignment();
    a.caseStudy = cases.findById(id).orElseThrow();
    a.student = users.findById(studentId).orElseThrow();
    return assignments.save(a);
  }

  private Map<String, Object> blockDto(Scenario s) {
    Map<String, Object> m = new LinkedHashMap<>();
    m.put("id", s.id); m.put("title", s.title); m.put("contextText", s.contextText);
    m.put("blockType", s.blockType); m.put("orderIndex", s.orderIndex);
    List<Question> qs = questions.findByScenarioIdOrderByOrderIndexAsc(s.id);
    if (!qs.isEmpty()) {
      Question q = qs.get(0);
      Map<String, Object> qm = new LinkedHashMap<>();
      qm.put("id", q.id); qm.put("text", q.text); qm.put("score", q.score);
      qm.put("options", options.findByQuestionIdOrderByIdAsc(q.id).stream().map(o -> {
        Map<String, Object> om = new LinkedHashMap<>();
        om.put("id", o.id); om.put("text", o.text); om.put("correct", o.correct); om.put("justification", o.justification);
        return om;
      }).toList());
      m.put("question", qm);
    }
    return m;
  }

  private Map<String, Object> studentDto(User u) {
    Map<String, Object> m = new LinkedHashMap<>();
    m.put("id", u.id); m.put("name", u.name); m.put("email", u.email);
    return m;
  }

  private void renumberBlocks(Long caseId) {
    List<Scenario> blocks = scenarios.findByCaseStudyIdOrderByOrderIndexAsc(caseId);
    for (int i = 0; i < blocks.size(); i++) {
      blocks.get(i).orderIndex = i + 1;
    }
    scenarios.saveAll(blocks);
  }

  @SuppressWarnings("unchecked")
  private List<Map<String, Object>> optionBodies(Object value) {
    return value instanceof List<?> list ? (List<Map<String, Object>>) list : List.of();
  }

  @SuppressWarnings("unchecked")
  private List<Map<String, Object>> importCaseBodies(Map<String, Object> body) {
    Object casesValue = body.get("cases");
    if (casesValue instanceof List<?> list) return (List<Map<String, Object>>) list;
    return List.of(body);
  }

  private List<Map<String, Object>> parseNaturalImport(String source) {
    List<Map<String, Object>> parsedCases = new ArrayList<>();
    Map<String, Object> currentCase = null;
    Map<String, Object> currentBlock = null;
    String currentTextField = null;

    for (String rawLine : source.replace("\r\n", "\n").replace('\r', '\n').split("\n")) {
      String line = rawLine.trim();
      if (line.isBlank() || line.matches("^-{3,}$")) continue;
      String normalized = normalizeKey(line);

      if (startsWithAny(normalized, "caso:", "titulo del caso:", "titulo:")) {
        currentCase = new LinkedHashMap<>();
        currentCase.put("title", valueAfterColon(line));
        currentCase.put("difficulty", "Media");
        currentCase.put("blocks", new ArrayList<Map<String, Object>>());
        parsedCases.add(currentCase);
        currentBlock = null;
        currentTextField = null;
        continue;
      }

      if (currentCase == null) throw new IllegalArgumentException("El documento debe iniciar con CASO: nombre del caso");

      if (startsWithAny(normalized, "categoria:", "categoria del caso:")) {
        currentCase.put("category", valueAfterColon(line));
        currentTextField = null;
        continue;
      }
      if (startsWithAny(normalized, "dificultad:", "nivel:")) {
        currentCase.put("difficulty", valueAfterColon(line));
        currentTextField = null;
        continue;
      }
      if (startsWithAny(normalized, "descripcion:", "descripcion del caso:", "resumen:")) {
        currentCase.put("description", valueAfterColon(line));
        currentTextField = "description";
        continue;
      }
      if (startsWithAny(normalized, "texto:", "cuadro de texto:", "pantalla de texto:", "bloque de texto:")) {
        currentBlock = new LinkedHashMap<>();
        currentBlock.put("type", "TEXT");
        currentBlock.put("title", valueAfterColon(line).isBlank() ? "Texto" : valueAfterColon(line));
        currentBlock.put("text", "");
        blocksOf(currentCase).add(currentBlock);
        currentTextField = "text";
        continue;
      }
      if (startsWithAny(normalized, "pregunta:", "pregunta cerrada:")) {
        currentBlock = new LinkedHashMap<>();
        currentBlock.put("type", "QUESTION");
        currentBlock.put("title", "Pregunta");
        currentBlock.put("question", valueAfterColon(line));
        currentBlock.put("score", 10);
        currentBlock.put("options", new ArrayList<Map<String, Object>>());
        blocksOf(currentCase).add(currentBlock);
        currentTextField = "question";
        continue;
      }
      if (startsWithAny(normalized, "puntaje:", "puntos:", "valor:")) {
        ensureQuestionBlock(currentBlock);
        currentBlock.put("score", intValue(valueAfterColon(line), 10));
        currentTextField = null;
        continue;
      }
      if (startsWithAny(normalized, "opciones:", "respuestas:", "alternativas:")) {
        ensureQuestionBlock(currentBlock);
        currentTextField = "options";
        continue;
      }
      if (isOptionLine(line)) {
        ensureQuestionBlock(currentBlock);
        optionListOf(currentBlock).add(parseNaturalOption(line));
        currentTextField = "options";
        continue;
      }

      if ("description".equals(currentTextField)) {
        currentCase.put("description", appendText(textValue(currentCase.get("description"), ""), line));
      } else if ("text".equals(currentTextField) && currentBlock != null) {
        currentBlock.put("text", appendText(textValue(currentBlock.get("text"), ""), line));
      } else if ("question".equals(currentTextField) && currentBlock != null) {
        currentBlock.put("question", appendText(textValue(currentBlock.get("question"), ""), line));
      }
    }

    validateNaturalImport(parsedCases);
    return parsedCases;
  }

  private void validateNaturalImport(List<Map<String, Object>> parsedCases) {
    for (Map<String, Object> c : parsedCases) {
      requiredText(c, "title");
      if (blocksOf(c).isEmpty()) throw new IllegalArgumentException("El caso " + c.get("title") + " no contiene bloques");
      for (Map<String, Object> block : blocksOf(c)) {
        if ("QUESTION".equals(block.get("type"))) {
          requiredText(block, "question");
          List<Map<String, Object>> opts = optionListOf(block);
          if (opts.size() < 3 || opts.size() > 4) throw new IllegalArgumentException("Cada pregunta debe tener entre 3 y 4 opciones");
          if (opts.stream().noneMatch(o -> boolValue(o.get("correct")))) throw new IllegalArgumentException("Cada pregunta debe tener al menos una opcion correcta");
        }
      }
    }
  }

  private Map<String, Object> parseNaturalOption(String line) {
    String text = line.replaceFirst("^[-*•]\\s*", "").replaceFirst("^[A-Za-z0-9]+[).]\\s*", "").trim();
    boolean correct = text.matches("(?i).*(\\[correcta\\]|\\(correcta\\)|\\[correcto\\]|\\(correcto\\)|\\[x\\]|\\(x\\)|=>\\s*correcta).*");
    text = text.replaceAll("(?i)\\s*(\\[correcta\\]|\\(correcta\\)|\\[correcto\\]|\\(correcto\\)|\\[x\\]|\\(x\\)|=>\\s*correcta)\\s*", " ").trim();
    Map<String, Object> option = new LinkedHashMap<>();
    option.put("text", text);
    option.put("correct", correct);
    return option;
  }

  private String normalizeKey(String line) {
    return java.text.Normalizer.normalize(line, java.text.Normalizer.Form.NFD)
      .replaceAll("\\p{M}", "")
      .toLowerCase(Locale.ROOT);
  }

  private boolean startsWithAny(String value, String... prefixes) {
    for (String prefix : prefixes) if (value.startsWith(prefix)) return true;
    return false;
  }

  private String valueAfterColon(String line) {
    int idx = line.indexOf(':');
    return idx >= 0 ? line.substring(idx + 1).trim() : "";
  }

  private boolean isOptionLine(String line) {
    return line.matches("^[-*•]\\s+.+") || line.matches("^[A-Za-z0-9]+[).]\\s+.+");
  }

  private String appendText(String previous, String line) {
    return previous == null || previous.isBlank() ? line : previous + "\n" + line;
  }

  @SuppressWarnings("unchecked")
  private List<Map<String, Object>> blocksOf(Map<String, Object> caseBody) {
    return (List<Map<String, Object>>) caseBody.computeIfAbsent("blocks", k -> new ArrayList<Map<String, Object>>());
  }

  @SuppressWarnings("unchecked")
  private List<Map<String, Object>> optionListOf(Map<String, Object> block) {
    return (List<Map<String, Object>>) block.computeIfAbsent("options", k -> new ArrayList<Map<String, Object>>());
  }

  private void ensureQuestionBlock(Map<String, Object> block) {
    if (block == null || !"QUESTION".equals(block.get("type"))) throw new IllegalArgumentException("Las opciones o puntajes deben ir despues de una PREGUNTA");
  }

  @SuppressWarnings("unchecked")
  private List<Map<String, Object>> mapList(Object value) {
    return value instanceof List<?> list ? (List<Map<String, Object>>) list : List.of();
  }

  private int intValue(Object value, int fallback) {
    if (value == null) return fallback;
    if (value instanceof Number n) return n.intValue();
    return Integer.parseInt(value.toString());
  }

  private String requiredText(Map<String, Object> body, String key) {
    String value = textValue(body.get(key), "");
    if (value.isBlank()) throw new IllegalArgumentException("El campo " + key + " es obligatorio");
    return value;
  }

  private String textValue(Object value, String fallback) {
    return value == null ? fallback : String.valueOf(value).trim();
  }

  private boolean boolValue(Object value) {
    if (value instanceof Boolean b) return b;
    return value != null && Boolean.parseBoolean(value.toString());
  }
}
