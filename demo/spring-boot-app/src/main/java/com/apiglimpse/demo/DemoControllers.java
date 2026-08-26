package com.apiglimpse.demo;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicInteger;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
public class DemoControllers {

  private final AtomicInteger nextId = new AtomicInteger(3);
  private final List<Map<String, Object>> users = new CopyOnWriteArrayList<>(List.of(
      user(1, "alice@example.com", "Alice", "555-0100"),
      user(2, "bob@example.com", "Bob", "555-0101")
  ));

  @GetMapping("/health")
  public Map<String, String> health() {
    return Map.of("status", "ok", "service", "demo-spring-boot");
  }

  @GetMapping("/api/users")
  public Map<String, Object> listUsers() {
    return Map.of("users", new ArrayList<>(users));
  }

  @GetMapping("/api/users/{id}")
  public Map<String, Object> getUser(@PathVariable int id) {
    return users.stream()
        .filter(u -> Integer.valueOf(id).equals(u.get("id")))
        .findFirst()
        .map(u -> Map.<String, Object>of("user", u))
        .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "User not found"));
  }

  @PostMapping("/api/users")
  public ResponseEntity<Map<String, Object>> createUser(@RequestBody Map<String, Object> body) {
    int id = nextId.getAndIncrement();
    Map<String, Object> user = user(
        id,
        str(body.get("email")),
        str(body.get("name")),
        str(body.get("phone")));
    users.add(user);

    Map<String, Object> out = new LinkedHashMap<>();
    out.put("id", id);
    out.put("email", user.get("email"));
    out.put("name", user.get("name"));
    out.put("phone", user.get("phone"));
    out.put("hasPassword", body.get("password") != null && !String.valueOf(body.get("password")).isBlank());
    out.put("hasSsn", body.get("ssn") != null && !String.valueOf(body.get("ssn")).isBlank());
    return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("user", out));
  }

  @PostMapping("/api/auth/login")
  public Map<String, Object> login(@RequestBody Map<String, Object> body) {
    String email = str(body.get("email"));
    String password = str(body.get("password"));
    if (email.isBlank() || password.isBlank()) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "email and password required");
    }
    Map<String, Object> res = new LinkedHashMap<>();
    res.put("token", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.demo.signature");
    res.put("user", Map.of("email", email));
    return res;
  }

  @GetMapping("/api/orders/{orderId}/items/{itemId}")
  public Map<String, Object> orderItem(@PathVariable String orderId, @PathVariable String itemId) {
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("orderId", orderId);
    out.put("itemId", itemId);
    out.put("sku", "SKU-100");
    out.put("qty", 2);
    return out;
  }

  private static Map<String, Object> user(int id, String email, String name, String phone) {
    Map<String, Object> u = new LinkedHashMap<>();
    u.put("id", id);
    u.put("email", email);
    u.put("name", name);
    u.put("phone", phone);
    return u;
  }

  private static String str(Object v) {
    return v == null ? "" : String.valueOf(v);
  }
}
